import uuid
from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from ..models import DeskDuty, Driver, KioskSession, Ticket, TicketForm, TicketSeries, User, Vehicle, WipMode
from ..serializers import TicketSerializer
from .helpers import expire_stale_kiosk_sessions, promote_queue_front
from .viewsets import _check_can_issue, _check_plan, _consume_series_fifo, _finalize_queued_vehicle, _issue_roam_tickets

# Self-service QR kiosk, two steps. The driver checks in (scan -> mode -> own name): a roam
# pays the check-in Personnel on duty (see DeskDuty) and is numbered right then, a queue
# vehicle just joins the line. The next scan checks the vehicle out under the check-out
# Personnel, who takes a queue vehicle's payment as it is numbered and leaves. Every outcome the kiosk screen reacts to comes back as a `state` string
# instead of an HTTP error.

OPEN = KioskSession.OPEN_STATUSES
PAUSED_MESSAGE = "Ticketing is paused for now — please see the dispatcher."


def _error_text(exc):
    detail = exc.detail
    while isinstance(detail, (dict, list)):
        detail = next(iter(detail.values())) if isinstance(detail, dict) else detail[0]
    return str(detail)


def _staff(request):
    # DEBUG runs the API open (AllowAny), so there may be no logged-in user.
    return request.user if request.user.is_authenticated else None


def _paused():
    return WipMode.get_solo().is_active


def _driver_name(driver):
    return f"{driver.last_name}, {driver.first_name}".strip()


def _find_vehicle(text):
    text = (text or '').strip()
    if not text:
        return None
    vehicles = Vehicle.objects.filter(is_archived=False).select_related('route', 'transportation_id')
    vehicle = vehicles.filter(Q(qr_code=text) | Q(plate_number=text)).first()
    if vehicle is None and text.isdigit():
        vehicle = vehicles.filter(id=int(text)).first()
    return vehicle


def _queue_ticket(vehicle):
    return Ticket.objects.filter(vehicle=vehicle, mode='QUEUE', status='QUEUED').select_related('driver').first()


def _queue_position(vehicle):
    ticket = _queue_ticket(vehicle)
    if not ticket:
        return None
    line = list(
        Ticket.objects.filter(route_id=ticket.route_id, mode='QUEUE', status='QUEUED')
        .order_by('queue_rank', 'issued_at').values_list('vehicle_id', flat=True)
    )
    return line.index(vehicle.id) + 1 if vehicle.id in line else 1


def _is_live(session, queued_vehicle_ids):
    """A QUEUE visit lives while its queue ticket does; a ROAM visit while the vehicle is
    still free (it may have been queued or dispatched at the front desk instead)."""
    if session.mode == 'QUEUE':
        return session.vehicle_id in queued_vehicle_ids
    return session.vehicle.status == 'AVAILABLE' and session.vehicle_id not in queued_vehicle_ids


def _live_sessions():
    queued = set(Ticket.objects.filter(mode='QUEUE', status='QUEUED').values_list('vehicle_id', flat=True))
    sessions = KioskSession.objects.filter(status__in=OPEN).select_related('vehicle__route', 'vehicle__transportation_id', 'driver')
    live, dead = [], []
    for session in sessions:
        (live if _is_live(session, queued) else dead).append(session)
    if dead:
        KioskSession.objects.filter(id__in=[s.id for s in dead]).update(status='CANCELLED')
    return live


def _open_session(vehicle):
    return next((s for s in _live_sessions() if s.vehicle_id == vehicle.id), None)


def _adopt_front_desk_queue(vehicle):
    """A vehicle queued at the front desk has no kiosk visit; its first kiosk scan adopts it
    (desk series, its own queue ticket's driver and check-in personnel) so it can check out here."""
    ticket = _queue_ticket(vehicle)
    desk = DeskDuty.get_solo()
    if ticket is None or desk.series is None:
        return None
    return KioskSession.objects.create(
        vehicle=vehicle, driver=ticket.driver, mode='QUEUE', plan=_stored(_plan_for(vehicle, desk)),
        checked_in_by_name=ticket.checked_in_by_name,
    )


def _vehicle_info(vehicle):
    price = vehicle.transportation_id.terminal_price if vehicle.transportation_id else None
    return {
        'id': vehicle.id,
        'plate': vehicle.plate_number,
        'route': vehicle.route.origin if vehicle.route else None,
        'amount': float(price) if price else None,
    }


def _expired_documents(vehicle, operator):
    """Lapsed papers that stop a check-in, for the kiosk's expired screen."""
    today = timezone.localdate()
    papers = [
        ("Vehicle registration", vehicle.franchise_expiration_date),
        ("Driver IWP permit", operator.iwp_expiration_date if operator else None),
    ]
    return [
        {'label': label, 'date': date, 'days_ago': (today - date).days}
        for label, date in papers if date and date < today
    ]


def _breakdown(plan):
    """The denominations a visit hands out, for the kiosk screen and the Dispatch board."""
    forms = TicketForm.objects.in_bulk([row['form'] for row in plan])
    return [
        {'label': forms[row['form']].name, 'price': float(forms[row['form']].price), 'qty': row['qty']}
        for row in plan if row['form'] in forms
    ]


def _reply(state, vehicle, session=None, **extra):
    data = {'state': state, 'vehicle': _vehicle_info(vehicle), **extra}
    if session:
        data.update(
            mode=session.mode, driver=_driver_name(session.driver), checked_in_by=session.checked_in_by_name,
            breakdown=_breakdown(session.plan),
        )
        if session.mode == 'QUEUE':
            data['position'] = _queue_position(vehicle)
    return Response(data)


def _busy_driver_ids():
    return set(Ticket.objects.filter(status='QUEUED').values_list('driver_id', flat=True)) | set(
        KioskSession.objects.filter(status__in=OPEN).values_list('driver_id', flat=True)
    )


def _quantity_for(vehicle, series):
    """Tickets of this series that add up to the vehicle type's terminal price (1 when there
    is no price, or it isn't a whole multiple) — mirrors ticketsNeeded() on the Dispatch board."""
    price = series.ticket_form.price or 0
    puv = vehicle.transportation_id
    terminal = puv.terminal_price if puv else 0
    return int(terminal / price) if terminal and price and terminal % price == 0 else 1


def _price_key(price):
    """How a terminal price is spelled in DeskDuty.recipes ('40', '12.5') — mirrors String(Number(price)) on the desk."""
    return f"{float(price):g}"


def _stocked(plan):
    """Can every row of the plan be drawn right now?"""
    try:
        with transaction.atomic():
            for form_id, quantity, series_id in plan:
                _consume_series_fifo(form_id, quantity, series_id)
    except ValidationError:
        return False
    return True


def _usable(vehicle, plan):
    try:
        _check_plan(vehicle, plan)
    except ValidationError:
        return False
    return _stocked(plan)


def _plan_for(vehicle, desk):
    """What this vehicle's visit draws, as [(ticket_form_id, quantity, series_id)]. The recipe
    for its price wins while the stock lasts; otherwise the desk's default series, enough of it
    to meet the price. With both short the dispatcher has to pick another denomination in
    Shift setup."""
    puv = vehicle.transportation_id
    recipe = [(r['form'], r['qty'], None) for r in desk.recipes.get(_price_key(puv.terminal_price), [])] if puv else []
    if recipe and _usable(vehicle, recipe):
        return recipe
    series = desk.series
    default = [(series.ticket_form_id, _quantity_for(vehicle, series), series.id)]
    _check_plan(vehicle, default)  # a default that can't meet the price is a setup problem, not a stock one
    if not _stocked(default):
        raise ValidationError({"detail": "No tickets left for this fare — please see the dispatcher."})
    return default


def _stored(plan):
    return [{'form': form_id, 'qty': quantity, 'series': series_id} for form_id, quantity, series_id in plan]


def _rows(session):
    """The visit's plan back as [(ticket_form_id, quantity, series_id)]."""
    if not session.plan:
        raise ValidationError({"series": "The ticket plan for this visit is gone — please see the dispatcher."})
    return [(row['form'], row['qty'], row.get('series')) for row in session.plan]


def _driver_choices(vehicle):
    busy = _busy_driver_ids()
    # `last` is the vehicle's last driver (kept on every check-in/swap), else its registered owner;
    # `suggested` is everyone with history on this vehicle, which is who Swap driver offers.
    last = vehicle.active_driver_id or vehicle.owner_driver_id
    history = set(Ticket.objects.filter(vehicle=vehicle).values_list('driver_id', flat=True)) | {
        vehicle.active_driver_id, vehicle.owner_driver_id,
    }
    drivers = Driver.objects.filter(status='ACTIVE', is_archived=False).exclude(id__in=busy).order_by('last_name', 'first_name')
    choices = [{'id': d.id, 'name': _driver_name(d), 'last': d.id == last, 'suggested': d.id in history} for d in drivers]
    return sorted(choices, key=lambda c: (not c['last'], not c['suggested']))


def _check_out(session, request):
    if not DeskDuty.get_solo().checkout_user_id:
        raise ValidationError({"detail": "No check-out personnel is on duty — please see the dispatcher."})
    with transaction.atomic():
        # Re-read under lock so a double scan can't check a visit out twice.
        if not KioskSession.objects.select_for_update().filter(pk=session.pk, status='PAID').exists():
            raise ValidationError({"detail": "This visit was already checked out."})
        if session.mode == 'ROAM':
            return _depart_roam(session)
        return _finalize_queued_vehicle(session.vehicle, _rows(session), 'QUEUE', request)


def _depart_roam(session):
    """A roam was numbered at check-in, so leaving only records the departure and who was on
    the check-out desk."""
    now = timezone.now()
    Ticket.objects.filter(
        vehicle=session.vehicle, mode='UNLOAD', status='COLLECTED', checked_out_at__isnull=True,
        dispatched_at__gte=session.created_at,
    ).update(checked_out_at=now, checked_out_by_name=DeskDuty.get_solo().checkout_name, updated_at=now)
    session.status = 'DONE'
    session.save(update_fields=['status', 'updated_at'])  # save, not update: the Dispatch board listens for it
    return list(Ticket.objects.filter(vehicle=session.vehicle, mode='UNLOAD', checked_out_at=now))


def _switch_out(session, request):
    """A queued vehicle cutting the line to roam pays at check-out like any queue vehicle, so
    its roam tickets are drawn and it leaves now, under the check-out Personnel."""
    rows = _rows(session)
    session.vehicle.refresh_from_db()  # the switch just freed it from QUEUED
    return _issue_roam_tickets(session.vehicle, session.driver, rows, request)


@api_view(['POST'])
def kiosk_scan(request):
    """A QR was scanned: tells the kiosk what to show (check-in choices, pay-first notice,
    wait-your-turn, or the checkout result — a paid visit at the front is checked out here)."""
    expire_stale_kiosk_sessions()
    vehicle = _find_vehicle(request.data.get('text'))
    if vehicle is None:
        return Response({'state': 'UNKNOWN'})

    session = _open_session(vehicle)
    if session is None:
        try:
            session = _adopt_front_desk_queue(vehicle)
        except ValidationError as exc:
            return _reply('ERROR', vehicle, message=_error_text(exc))
    if session is None:
        if vehicle.status != 'AVAILABLE':
            return _reply('BLOCKED', vehicle, message=f"This vehicle is {vehicle.status.lower()} and can't check in.")
        operator = vehicle.active_driver or vehicle.owner_driver
        expired = _expired_documents(vehicle, operator)
        if expired:
            return _reply('EXPIRED', vehicle, expired=expired, driver=_driver_name(operator) if operator else None)
        if _paused():
            return _reply('BLOCKED', vehicle, message=PAUSED_MESSAGE)
        return _reply('CHECK_IN', vehicle, drivers=_driver_choices(vehicle))

    # A queue vehicle leaves only when it reaches the front of its line.
    if session.mode == 'QUEUE' and _queue_position(vehicle) > 1:
        return _reply('WAIT_TURN', vehicle, session)
    if _paused():
        return _reply('ERROR', vehicle, session, message=PAUSED_MESSAGE)
    try:
        tickets = _check_out(session, request)
    except ValidationError as exc:
        return _reply('ERROR', vehicle, session, message=_error_text(exc))
    return _reply('DEPARTED', vehicle, session, tickets=[t.id for t in tickets])


@api_view(['POST'])
def kiosk_check_in(request):
    """Driver picked a mode and their own name. Queue joins the line right away; roam only
    opens a pending visit. They pay the check-in Personnel now, which fixes the ticket series
    (the desk's) and quantity that checkout draws."""
    mode = request.data.get('mode')
    if mode not in ('QUEUE', 'ROAM'):
        raise ValidationError({"mode": "Pick Queue or Roam."})
    try:
        if _paused():
            raise ValidationError({"detail": PAUSED_MESSAGE})
        desk = DeskDuty.get_solo()
        if not desk.checkin_user_id or desk.series is None:
            raise ValidationError({"detail": "The dispatcher hasn't set a check-in personnel and ticket series yet."})
        with transaction.atomic():
            vehicle = Vehicle.objects.select_for_update().select_related('route', 'transportation_id').get(
                id=request.data.get('vehicle_id'), is_archived=False,
            )
            driver = Driver.objects.get(id=request.data.get('driver_id'), is_archived=False)
            if _open_session(vehicle):
                raise ValidationError({"vehicle_id": "This vehicle is already checked in."})
            if driver.id in _busy_driver_ids():
                raise ValidationError({"driver_id": "This driver is already checked in on another vehicle."})
            _check_can_issue(vehicle, driver)
            plan = _plan_for(vehicle, desk)

            queue_code = ''
            if mode == 'QUEUE':
                serializer = TicketSerializer(data={
                    'id': f"Q-{uuid.uuid4()}", 'vehicle_id': vehicle.id, 'driver_id': driver.id,
                    'route': vehicle.route_id, 'status': 'QUEUED', 'mode': 'QUEUE', 'is_verified': False,
                }, context={'request': request})
                serializer.is_valid(raise_exception=True)
                queue_code = serializer.save(active_user=_staff(request)).queue_code
            session = KioskSession.objects.create(
                vehicle=vehicle, driver=driver, mode=mode, plan=_stored(plan), checked_in_by_name=desk.checkin_name,
            )
            if mode == 'ROAM':
                _issue_roam_tickets(vehicle, driver, plan, request, depart=False)
    except (Vehicle.DoesNotExist, Driver.DoesNotExist):
        return Response({'state': 'ERROR', 'message': "That vehicle or driver wasn't found."})
    except ValidationError as exc:
        return Response({'state': 'ERROR', 'message': _error_text(exc)})
    return _reply('CHECKED_IN', vehicle, session, queue_code=queue_code)


@api_view(['GET'])
def kiosk_sessions(request):
    """Roam visits checked in on the kiosk that haven't checked out yet, for the Dispatch board
    (queue visits already show there as queued vehicles)."""
    return Response([
        {
            'vehicle_id': s.vehicle_id,
            'plate': s.vehicle.plate_number,
            'route': s.vehicle.route.origin if s.vehicle.route else None,
            'driver': _driver_name(s.driver),
            'mode': s.mode,
            'amount': _vehicle_info(s.vehicle)['amount'],
            'breakdown': _breakdown(s.plan),
            'checked_in_by': s.checked_in_by_name,
            'checked_in_at': s.created_at,
        }
        for s in _live_sessions() if s.mode == 'ROAM'
    ])


def _desk_payload(desk):
    personnel = User.objects.filter(role='PERSONNEL', is_active=True).order_by('first_name', 'last_name')
    return {
        'checkin_user': desk.checkin_user_id,
        'checkout_user': desk.checkout_user_id,
        'series': desk.series_id,
        'recipes': desk.recipes,
        'personnel': [{'id': u.id, 'name': u.display_name} for u in personnel],
    }


def _pick(request, field, queryset):
    value = request.data[field]
    if value in (None, ''):
        return None
    obj = queryset.filter(pk=value).first() if str(value).isdigit() else None
    if obj is None:
        raise ValidationError({field: "Not found."})
    return obj


def _clean_recipes(raw):
    """Each recipe must add up exactly to its price: {"40": [{"form": id, "qty": n}, ...]}.
    An emptied recipe is a removed one."""
    if not isinstance(raw, dict):
        raise ValidationError({"recipes": "Recipes must map each price to its ticket rows."})
    forms = TicketForm.objects.in_bulk()
    clean = {}
    for price, rows in raw.items():
        try:
            target = Decimal(str(price))
            parsed = [(int(row['form']), int(row['qty'])) for row in rows]
        except (ArithmeticError, TypeError, ValueError, KeyError):
            raise ValidationError({"recipes": f"The ₱{price} recipe is malformed."})
        if not parsed:
            continue
        if len({form_id for form_id, _ in parsed}) < len(parsed) or any(f not in forms or q < 1 for f, q in parsed):
            raise ValidationError({"recipes": f"The ₱{price} recipe has an unknown ticket form, a repeated one, or a quantity below 1."})
        total = sum(forms[form_id].price * quantity for form_id, quantity in parsed)
        if total != target:
            raise ValidationError({"recipes": f"The ₱{price} recipe adds up to ₱{total:.2f}."})
        clean[_price_key(target)] = [{'form': form_id, 'qty': quantity} for form_id, quantity in parsed]
    return clean


# Supervisor and Manager are one position under two titles.
DESK_ASSIGNERS = ('SUPERADMIN', 'SUPERVISOR', 'MANAGER')


@api_view(['GET', 'PATCH'])
def desk_duty(request):
    """Who is on the Dispatch desk (check-in / check-out Personnel) and which ticket series the
    kiosk draws from. Set from the Dispatch board; stamped onto every vehicle as it goes through."""
    desk = DeskDuty.get_solo()
    if request.method == 'PATCH':
        personnel = User.objects.filter(role='PERSONNEL', is_active=True)
        for field in ('checkin_user', 'checkout_user'):
            if field in request.data:
                if request.user.role not in DESK_ASSIGNERS:
                    raise PermissionDenied('Only an admin or supervisor can change the desk personnel.')
                setattr(desk, field, _pick(request, field, personnel))
        if 'series' in request.data:
            desk.series = _pick(request, 'series', TicketSeries.objects.filter(ticket_form__isnull=False).exclude(requisition__status='PENDING'))  # unvalidated stock can't be issued
        if 'recipes' in request.data:
            if request.user.role not in DESK_ASSIGNERS:
                raise PermissionDenied('Only an admin or supervisor can change the ticket recipes.')
            desk.recipes = _clean_recipes(request.data['recipes'])
        desk.save()
    return Response(_desk_payload(desk))


@api_view(['POST'])
def kiosk_switch_roam(request):
    """A queued vehicle that isn't at the front would rather roam than load from the line.
    The switch is the check-out: its queue ticket is dropped, its roam tickets are issued and
    it leaves now, skipping the line."""
    vehicle = _find_vehicle(request.data.get('text'))
    if vehicle is None:
        return Response({'state': 'UNKNOWN'})
    session = _open_session(vehicle)
    route = vehicle.route
    if session is None or session.mode != 'QUEUE':
        return _reply('ERROR', vehicle, message="This vehicle isn't waiting in a queue.")
    if _paused():
        return _reply('ERROR', vehicle, session, message=PAUSED_MESSAGE)
    try:
        with transaction.atomic():
            Ticket.objects.filter(vehicle=vehicle, mode='QUEUE', status='QUEUED').delete()
            Vehicle.objects.filter(id=vehicle.id, status='QUEUED').update(status='AVAILABLE', updated_at=timezone.now())
            session.mode = 'ROAM'
            session.save(update_fields=['mode', 'updated_at'])
            tickets = _switch_out(session, request)
    except ValidationError as exc:
        return _reply('ERROR', vehicle, session, message=_error_text(exc))
    promote_queue_front(route)
    return _reply('DEPARTED', vehicle, session, tickets=[t.id for t in tickets])


@api_view(['POST'])
def kiosk_cancel(request):
    """Drops a pending roam visit (queue visits end by cancelling their queue ticket)."""
    session = KioskSession.objects.filter(
        vehicle_id=request.data.get('vehicle_id'), mode='ROAM', status__in=OPEN,
    ).first()
    if session is None:
        raise ValidationError({"vehicle_id": "No pending roam visit for that vehicle."})
    session.status = 'CANCELLED'
    session.save(update_fields=['status', 'updated_at'])
    return Response({'status': session.status})
