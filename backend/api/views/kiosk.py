import uuid

from django.db import transaction
from django.db.models import Q
from rest_framework.decorators import api_view
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from ..models import DeskDuty, Driver, KioskSession, Ticket, TicketSeries, User, Vehicle, WipMode
from ..serializers import TicketSerializer
from .helpers import expire_stale_queue_tickets
from .viewsets import _check_can_issue, _check_terminal_price, _finalize_queued_vehicle, _issue_roam_tickets

# Self-service QR kiosk. The driver checks in (scan -> mode -> own name) and pays the
# check-in Personnel on duty (see DeskDuty) on the spot; the next scan checks the vehicle
# out under the check-out Personnel. Every outcome the kiosk screen reacts to comes back
# as a `state` string instead of an HTTP error.

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


def _find_driver(data):
    """The picked driver (operator list) or the one whose own QR was scanned (swap driver)."""
    drivers = Driver.objects.filter(is_archived=False)
    qr = (data.get('driver_qr') or '').strip()
    if not qr:
        return drivers.get(id=data.get('driver_id'))
    driver = drivers.filter(Q(qr_code=qr) | Q(iwp_number=qr)).first()
    if driver is None:
        raise ValidationError({"driver_qr": "Driver QR not recognized — try again or see the dispatcher."})
    return driver


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


def _vehicle_info(vehicle):
    price = vehicle.transportation_id.terminal_price if vehicle.transportation_id else None
    return {
        'id': vehicle.id,
        'plate': vehicle.plate_number,
        'route': vehicle.route.origin if vehicle.route else None,
        'amount': float(price) if price else None,
    }


def _reply(state, vehicle, session=None, **extra):
    data = {'state': state, 'vehicle': _vehicle_info(vehicle), **extra}
    if session:
        data.update(mode=session.mode, driver=_driver_name(session.driver), checked_in_by=session.checked_in_by_name)
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


def _driver_choices(vehicle):
    busy = _busy_driver_ids()
    mine = {vehicle.active_driver_id, vehicle.owner_driver_id}
    drivers = Driver.objects.filter(status='ACTIVE', is_archived=False).exclude(id__in=busy).order_by('last_name', 'first_name')
    choices = [{'id': d.id, 'name': _driver_name(d), 'suggested': d.id in mine} for d in drivers]
    return sorted(choices, key=lambda c: not c['suggested'])


def _check_out(session, request):
    if not DeskDuty.get_solo().checkout_user_id:
        raise ValidationError({"detail": "No check-out personnel is on duty — please see the dispatcher."})
    with transaction.atomic():
        # Re-read under lock so a double scan can't issue a roam ticket twice.
        if not KioskSession.objects.select_for_update().filter(pk=session.pk, status='PAID').exists():
            raise ValidationError({"detail": "This visit was already checked out."})
        series = session.series
        if series is None or series.ticket_form_id is None:
            raise ValidationError({"series": "The ticket series for this visit is gone — please see the dispatcher."})
        if session.mode == 'QUEUE':
            return _finalize_queued_vehicle(
                session.vehicle, series.ticket_form_id, session.quantity, 'QUEUE', request, series.id,
            )
        return _issue_roam_tickets(
            session.vehicle, session.driver, series.ticket_form, session.quantity, request, series.id,
        )


@api_view(['POST'])
def kiosk_scan(request):
    """A QR was scanned: tells the kiosk what to show (check-in choices, pay-first notice,
    wait-your-turn, or the checkout result — a paid visit at the front is checked out here)."""
    expire_stale_queue_tickets()
    vehicle = _find_vehicle(request.data.get('text'))
    if vehicle is None:
        return Response({'state': 'UNKNOWN'})

    session = _open_session(vehicle)
    if session is None:
        if vehicle.status != 'AVAILABLE':
            return _reply('BLOCKED', vehicle, message=f"This vehicle is {vehicle.status.lower()} and can't check in.")
        if vehicle.franchise_expired:
            return _reply('BLOCKED', vehicle, message="This vehicle's franchise has expired — please renew it first.")
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
            driver = _find_driver(request.data)
            if _open_session(vehicle):
                raise ValidationError({"vehicle_id": "This vehicle is already checked in."})
            if driver.id in _busy_driver_ids():
                raise ValidationError({"driver_id": "This driver is already checked in on another vehicle."})
            _check_can_issue(vehicle, driver)
            quantity = _quantity_for(vehicle, desk.series)
            _check_terminal_price(vehicle, desk.series.ticket_form.price or 0, quantity)

            queue_code = ''
            if mode == 'QUEUE':
                serializer = TicketSerializer(data={
                    'id': f"Q-{uuid.uuid4()}", 'vehicle_id': vehicle.id, 'driver_id': driver.id,
                    'route': vehicle.route_id, 'status': 'QUEUED', 'mode': 'QUEUE', 'is_verified': False,
                }, context={'request': request})
                serializer.is_valid(raise_exception=True)
                queue_code = serializer.save(active_user=_staff(request)).queue_code
            session = KioskSession.objects.create(
                vehicle=vehicle, driver=driver, mode=mode, series=desk.series, quantity=quantity,
                checked_in_by_name=desk.checkin_name,
            )
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


@api_view(['GET', 'PATCH'])
def desk_duty(request):
    """Who is on the Dispatch desk (check-in / check-out Personnel) and which ticket series the
    kiosk draws from. Set from the Dispatch board; stamped onto every vehicle as it goes through."""
    desk = DeskDuty.get_solo()
    if request.method == 'PATCH':
        personnel = User.objects.filter(role='PERSONNEL', is_active=True)
        for field in ('checkin_user', 'checkout_user'):
            if field in request.data:
                setattr(desk, field, _pick(request, field, personnel))
        if 'series' in request.data:
            desk.series = _pick(request, 'series', TicketSeries.objects.filter(ticket_form__isnull=False))
        desk.save()
    return Response(_desk_payload(desk))


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
