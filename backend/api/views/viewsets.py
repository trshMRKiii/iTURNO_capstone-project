import uuid
from datetime import date

from django.conf import settings
from django.core.files.uploadedfile import UploadedFile
from django.core.mail import EmailMultiAlternatives
from django.db import transaction
from django.db.models import Count, Q
from django.db.models.functions import Length
from django.template.loader import render_to_string
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated, BasePermission, SAFE_METHODS
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import LOCAL_ADMIN_PK_BASE, DeskDuty, KioskSession, PendingAccountEmail, PendingFleetAccess, User, Driver, Vehicle, Route, Ticket, TicketPrice, PUVType, RemittanceBatch, TicketForm, Requisition, TicketSeries, PaperIssuance, WipMode
from ..serializers import UserSerializer, SelfProfileSerializer, DriverSerializer, VehicleSerializer, RouteSerializer, TicketSerializer, TicketPriceSerializer, PUVTypeSerializer, RemittanceBatchSerializer, TicketFormSerializer, RequisitionSerializer, TicketSeriesSerializer, PaperIssuanceSerializer
from ..sync.account_emails import flush_account_emails, queue_account_email
from ..sync.fleet_access import flush_fleet_access
from ..sync.settings_outbox import flush_settings, next_offline_pk, park, park_delete
from ..sms import send_sms_async, queue_next_message
from .helpers import record_audit_log, expire_stale_kiosk_sessions, supabase_reachable, can_write_remote, remote_db, mirror_user, paper_numbers_by_series, parse_date_start, parse_date_end, paginate_request, promote_queue_front
from .remittance_export import remittance_xlsx_response


class ServiceUnavailable(APIException):
    status_code = 503
    default_code = 'service_unavailable'


class AuditLogMixin:
    """Records create/update/delete actions performed through this viewset to AuditLog."""

    def _safe_changes(self):
        data = getattr(self.request, 'data', None)
        if not hasattr(data, 'items'):
            return {}
        safe = {}
        for key, value in data.items():
            if key == 'password':
                continue
            safe[key] = f"<file: {value.name}>" if isinstance(value, UploadedFile) else value
        return safe

    def _audit(self, action, instance, changes=None):
        record_audit_log(
            user=self.request.user,
            action=action,
            model_name=instance.__class__.__name__,
            object_id=instance.pk,
            object_repr=str(instance),
            changes=changes,
        )

    def perform_create(self, serializer):
        instance = serializer.save()
        self._audit('CREATE', instance, self._safe_changes())
        return instance

    def perform_update(self, serializer):
        instance = serializer.save()
        self._audit('UPDATE', instance, self._safe_changes())
        return instance

    def perform_destroy(self, instance):
        self._audit('DELETE', instance)
        instance.delete()


# Supervisor and Manager are the same position under two titles.
LEAD_ROLES = ('SUPERVISOR', 'MANAGER')

# Columns the staff import reads, and the most accounts one request may create (each one
# sends an email, so this also bounds a single flush).
IMPORT_FIELDS = ('username', 'first_name', 'middle_name', 'last_name', 'role')
IMPORT_MAX_ROWS = 500


def is_fleet_tick(request, view):
    return getattr(view, 'action', None) == 'partial_update' and set(request.data) == {'can_manage_fleet'}


class IsAdminOrFleetAccessGrant(BasePermission):
    """Any authenticated user may view the staff registry; only Admins may create/update
    accounts. Supervisors/Managers may additionally PATCH a Personnel's can_manage_fleet
    tick (UserViewSet.perform_update enforces the target) and nothing else."""

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if request.method in SAFE_METHODS or user.role == 'SUPERADMIN':
            return True
        return user.role in LEAD_ROLES and is_fleet_tick(request, view)


class CanManageFleet(BasePermission):
    """Vehicle/driver writes: Admins and leads always; Personnel may only register (POST)
    once ticked — never edit or archive."""

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        if user.role == 'SUPERADMIN' or user.role in LEAD_ROLES:
            return True
        return user.can_manage_fleet and request.method == 'POST'


class IsSupervisorOrAdminForWrite(BasePermission):
    """Backfill/WIP-mode: transactional territory, so leads (Supervisor/Manager) and
    SUPERADMIN both qualify (unlike the System tab's backup/restore, which stays
    SUPERADMIN-only). Reads are open to any authenticated user so the WIP-mode banner
    works for every role — only toggling/importing is restricted."""

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in SAFE_METHODS:
            return True
        return request.user.role in (*LEAD_ROLES, 'SUPERADMIN')


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)

    def patch(self, request):
        # Same rule as UserViewSet: User is Supabase-authoritative, so an edit made
        # offline would be wiped by the next pull. Local-only admins never lived there.
        user = request.user
        if user.pk < LOCAL_ADMIN_PK_BASE:
            if not can_write_remote():
                raise ServiceUnavailable('Your profile can only be changed while online. Reconnect to the internet and try again.')
            user = User.objects.using(remote_db()).get(pk=user.pk)
        serializer = SelfProfileSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSerializer(user).data)


class UserViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAuthenticated, IsAdminOrFleetAccessGrant]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        # Writes must land on Supabase (see get_queryset), so refuse them
        # cleanly when offline instead of crashing; reads fall back to the
        # local pulled copy.
        # The fleet tick (see _set_fleet_access) and registering an account (see
        # UserSerializer.create) are the writes that work offline.
        if (request.method not in SAFE_METHODS and not is_fleet_tick(request, self)
                and getattr(self, 'action', None) not in ('create', 'import_users') and not can_write_remote()):
            raise ServiceUnavailable('Staff accounts can only be changed while online. Reconnect to the internet and try again.')

    def get_queryset(self):
        qs = self._staff_queryset()
        # Supervisors/Managers only ever deal with Personnel here.
        return qs.filter(role='PERSONNEL') if self.request.user.role in LEAD_ROLES else qs

    def _staff_queryset(self):
        if not can_write_remote():
            return User.objects.using('default').all()
        # Accounts created offline sit parked locally until a sync cycle uploads them, and
        # this list reads Supabase — push them now so they don't vanish from it on reconnect.
        flush_settings()
        flush_account_emails()
        # Reads (and, via the auto-routing below, every write this viewset makes)
        # target Supabase directly rather than the local pulled cache — User is
        # Supabase-authoritative (see api/sync/registry.py), so a user created
        # here has to actually land there or the next pull cycle deletes the
        # LAN-only row before the temp-password email goes out. Fetching
        # via .using('supabase') also means perform_update/perform_destroy's
        # plain instance.save()/.delete() (AuditLogMixin) route to 'supabase'
        # automatically — Django's router falls back to the instance's own
        # _state.db when no custom router is configured.
        return User.objects.using(remote_db()).all()

    def _guard_account_change(self, target, role, is_active):
        """Accounts belong to people, roles are permissions: several people may share a
        role, but the system must never lose its last active admin or let someone lock
        themselves out. Enforced here (not just in the UI) so no client can bypass it."""
        losing_access = not is_active or role != target.role
        if target.pk == self.request.user.pk and losing_access:
            raise ValidationError('You cannot deactivate or change the role of your own account.')
        if target.role == 'SUPERADMIN' and target.is_active and (not is_active or role != 'SUPERADMIN'):
            other_admins = User.objects.using(remote_db()).filter(role='SUPERADMIN', is_active=True).exclude(pk=target.pk)
            if not other_admins.exists():
                raise ValidationError('This is the last active Admin. Promote or create another Admin first.')

    def _register(self, serializer, changes=None):
        # The temp password only exists in the login email, so it is always parked first
        # (callers flush): sent at once when online, kept (surviving restarts) until then.
        instance = serializer.save()
        self._audit('CREATE', instance, self._safe_changes() if changes is None else changes)
        queue_account_email(instance, instance.raw_password)
        return instance

    def perform_create(self, serializer):
        instance = self._register(serializer)
        flush_account_emails()
        instance.email_queued = PendingAccountEmail.objects.filter(user_id=instance.pk).exists()
        return instance

    @action(detail=False, methods=['post'], url_path='import')
    def import_users(self, request):
        """Bulk-register staff from parsed CSV rows. `commit` false only validates, so the
        client can show a preview; true creates every valid row (re-validated here) and
        skips the rest. Admin accounts are never bulk-created."""
        rows = request.data.get('rows')
        if not isinstance(rows, list) or not rows:
            raise ValidationError('No rows to import.')
        if len(rows) > IMPORT_MAX_ROWS:
            raise ValidationError(f'Import at most {IMPORT_MAX_ROWS} accounts at a time.')

        existing = {name.lower() for name in self._staff_queryset().values_list('username', flat=True)}
        seen = set()
        results = []
        for line, raw in enumerate(rows, start=1):
            raw = raw if isinstance(raw, dict) else {}
            row = {k: str(raw.get(k) or '').strip() for k in IMPORT_FIELDS}
            row['role'] = row['role'].upper() or 'PERSONNEL'
            serializer = UserSerializer(data=row)
            email = row['username'].lower()
            if not (row['first_name'] and row['last_name']):
                reason = 'First and last name are required.'
            elif row['role'] in ('SUPERADMIN', 'ADMIN'):
                reason = 'Admin accounts must be added one at a time.'
            elif not serializer.is_valid():
                reason = ' '.join(str(e) for errs in serializer.errors.values() for e in errs)
            elif email in existing:
                reason = 'A user with that email already exists.'
            elif email in seen:
                reason = 'Email appears more than once in this file.'
            else:
                reason = None
                seen.add(email)
            results.append({'line': line, 'outcome': 'error' if reason else 'ok', 'reason': reason, 'serializer': serializer, **row})

        created = []
        if request.data.get('commit'):
            created = [
                self._register(r['serializer'], {**{k: r[k] for k in IMPORT_FIELDS}, 'imported': True}).pk
                for r in results if r['outcome'] == 'ok'
            ]
            flush_account_emails()
        return Response({
            'created': len(created),
            'emails_queued': PendingAccountEmail.objects.filter(user_id__in=created).count(),
            'rows': [{k: v for k, v in r.items() if k != 'serializer'} for r in results],
        })

    def _set_fleet_access(self, target, allowed):
        """Save locally now, park for Supabase; flush at once if online, else the sync cycle does."""
        User.objects.using('default').filter(pk=target.pk).update(can_manage_fleet=allowed)
        PendingFleetAccess.objects.update_or_create(user_id=target.pk, defaults={'can_manage_fleet': allowed})
        flush_fleet_access()
        target.can_manage_fleet = allowed
        self._audit('UPDATE', target, {'can_manage_fleet': allowed})

    def perform_update(self, serializer):
        data = serializer.validated_data
        target = serializer.instance
        if set(data) == {'can_manage_fleet'}:
            if self.request.user.role != 'SUPERADMIN' and target.role != 'PERSONNEL':
                raise PermissionDenied('Fleet access only applies to Personnel accounts.')
            self._set_fleet_access(target, data['can_manage_fleet'])
            return target
        if self.request.user.role != 'SUPERADMIN' and target.role != 'PERSONNEL':
            raise PermissionDenied('Fleet access only applies to Personnel accounts.')
        self._guard_account_change(target, data.get('role', target.role), data.get('is_active', target.is_active))
        instance = super().perform_update(serializer)
        mirror_user(instance)
        return instance

    def destroy(self, request, *args, **kwargs):
        # Accounts are never deleted (it would orphan their history) — deactivate instead.
        raise ValidationError('Staff accounts cannot be deleted. Deactivate the account instead.')


def send_new_account_email(user, raw_password):
    """Hands over the temp password so a new account can sign in."""
    user_name = user.first_name or user.username
    login_link = settings.PUBLIC_APP_URL
    text_body = (
        f"Hi {user_name},\n\n"
        "An account was created for you on the North Central Terminal management system. "
        "Use the temporary credentials below to sign in — "
        "you'll be asked to choose your own password right after logging in.\n\n"
        f"Email: {user.username}\n"
        f"Temporary password: {raw_password}\n\n"
        f"{login_link}"
    )
    html_body = render_to_string('emails/new_account.html', {
        'user_name': user_name,
        'username': user.username,
        'temp_password': raw_password,
        'login_link': login_link,
    })
    email = EmailMultiAlternatives(
        subject='Your North Central Terminal account is ready',
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[user.username],
    )
    email.attach_alternative(html_body, 'text/html')
    email.send(fail_silently=False)


class DriverViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = Driver.objects.all()
    serializer_class = DriverSerializer
    permission_classes = [CanManageFleet]

    def get_queryset(self):
        qs = super().get_queryset()
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status__in=[s.strip() for s in status_param.split(',') if s.strip()])
        is_archived = self.request.query_params.get('is_archived')
        if is_archived is not None:
            qs = qs.filter(is_archived=is_archived.lower() in ('1', 'true', 'yes'))
        return qs


class Conflict(APIException):
    status_code = 409
    default_code = 'conflict'


class ArchivableSettingMixin:
    """Route / PUV type: lists hide archived rows unless ?is_archived=true, and a
    row still referenced by vehicles/tickets can only be archived, never deleted.
    `usage` maps each queryset annotation to the label shown in the block message."""
    usage = {}

    def get_queryset(self):
        qs = super().get_queryset().annotate(
            **{name: Count(rel, distinct=True) for name, (rel, _) in self.usage.items()}
        )
        if self.action == 'list':
            flag = self.request.query_params.get('is_archived', 'false')
            qs = qs.filter(is_archived=flag.lower() in ('1', 'true', 'yes'))
        return qs

    def perform_destroy(self, instance):
        used = [f"{getattr(instance, name)} {label}" for name, (_, label) in self.usage.items() if getattr(instance, name)]
        if used:
            raise Conflict(f'"{instance}" is still used by {" and ".join(used)}. Archive it instead.')
        super().perform_destroy(instance)


class OfflineSettingWriteMixin:
    """Route / ticket price / ticket form / PUV type are Supabase-authoritative
    (PULL_MODELS), so a LAN-only save would be overwritten by the next pull. Creates,
    edits and deletes therefore work offline: applied locally, parked in PendingSetting
    and pushed once Supabase is reachable (flushed at once when it already is). Online
    creates go Supabase-first so the id comes from Postgres's sequence; offline ones take
    an id above LOCAL_ADMIN_PK_BASE. Online deletes hit Supabase in the same transaction."""

    def perform_create(self, serializer):
        instance = serializer.Meta.model(**serializer.validated_data)
        if not settings.DEBUG and supabase_reachable():
            instance.save(using='supabase')
        else:
            instance.pk = next_offline_pk(type(instance))
        instance.save(using='default')
        park(instance)
        flush_settings()
        serializer.instance = instance
        self._audit('CREATE', instance, self._safe_changes())
        return instance

    def perform_update(self, serializer):
        instance = super().perform_update(serializer)
        park(instance)
        flush_settings()
        return instance

    def perform_destroy(self, instance):
        model, pk = type(instance), instance.pk
        with transaction.atomic(using='default'):
            super().perform_destroy(instance)
            if can_write_remote():
                model.objects.using(remote_db()).filter(pk=pk).delete()
            else:
                park_delete(model, pk)


class RouteViewSet(OfflineSettingWriteMixin, ArchivableSettingMixin, AuditLogMixin, viewsets.ModelViewSet):
    queryset = Route.objects.all()
    serializer_class = RouteSerializer
    usage = {'vehicle_count': ('vehicles', 'vehicle(s)'), 'ticket_count': ('tickets', 'ticket(s)')}


class VehicleViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = Vehicle.objects.select_related('route', 'active_driver', 'owner_driver', 'transportation_id').all()
    serializer_class = VehicleSerializer
    permission_classes = [CanManageFleet]

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        status_param = params.get('status')
        if status_param:
            qs = qs.filter(status__in=[s.strip() for s in status_param.split(',') if s.strip()])
        is_archived = params.get('is_archived')
        if is_archived is not None:
            qs = qs.filter(is_archived=is_archived.lower() in ('1', 'true', 'yes'))
        return qs

    def list(self, request, *args, **kwargs):
        expire_stale_kiosk_sessions()
        return super().list(request, *args, **kwargs)

    def perform_update(self, serializer):
        instance = serializer.save()
        # Vehicle status is patched constantly by ticketing/dispatch/roaming flows
        # (already reflected in Transaction/Roaming Logs) — only the full profile
        # edit form on the Vehicle Registry page (a PUT) belongs in the audit trail.
        if self.request.method == 'PUT':
            self._audit('UPDATE', instance, self._safe_changes())
        return instance


def _consume_series_fifo(ticket_form_id, quantity, series_id=None):
    """Assign `quantity` physical ticket numbers to a denomination, drawing from the
    oldest ticket series first and spilling into the next-oldest one as each depletes.

    Which numbers are already taken is looked up directly (which Ticket rows
    reference this series), not derived from a count — a paper backfill can claim
    a specific number in the middle of a series' range (see backfill.py), so the
    next number handed out here must skip whatever's actually taken rather than
    assuming issuance is contiguous from start_no, or it could hand out a number
    a backfill already claimed.

    Locks the TicketSeries rows for this denomination (must be called inside
    transaction.atomic()) so two concurrent dispatches drawing from the same
    denomination — even for different vehicles/routes — serialize instead of
    both reading the same "remaining" set and handing out the same physical
    ticket number twice.

    If `series_id` is given, only that one series is drawn from (no spill-over).

    Returns a list of (series, ticket_id) pairs of length `quantity`.
    Raises ValidationError if stock runs out.
    """
    qs = TicketSeries.objects.select_for_update().filter(
        ticket_form_id=ticket_form_id, requisition__is_archived=False,
    ).exclude(requisition__status='PENDING')  # unvalidated stock can't be issued
    if series_id:
        qs = qs.filter(id=series_id)
    series_list = list(qs.order_by('requisition_id', 'id'))
    # Paper-issued numbers are as unavailable as system-issued ones.
    paper = paper_numbers_by_series([s.id for s in series_list])
    taken_by_series = {
        s.id: set(s.tickets.values_list('id', flat=True)) | {str(n) for n in paper.get(s.id, ())}
        for s in series_list
    }
    total_available = sum(
        max(int(s.end_no) - int(s.start_no) + 1 - len(taken_by_series[s.id]), 0) for s in series_list
    )
    if quantity > total_available:
        raise ValidationError({
            "quantity": f"Only {total_available} ticket(s) remaining for this {'series' if series_id else 'denomination'}."
        })

    # Ticket.id is the bare number and is the primary key across *all* series, so
    # overlapping ranges (e.g. a new series 1-2 after an archived one covering 1-20000)
    # would collide on a number used by a different series. Check candidates against
    # every existing Ticket id, in small windows, not just this series' own tickets.
    units = []
    remaining = quantity
    for series in series_list:
        if remaining <= 0:
            break
        taken = taken_by_series[series.id]
        n = int(series.start_no)
        end = int(series.end_no)
        while remaining > 0 and n <= end:
            window_end = min(end, n + remaining + len(taken) + 50)
            window = [str(i) for i in range(n, window_end + 1)]
            used = taken | set(Ticket.objects.filter(id__in=window).values_list('id', flat=True))
            for candidate in window:
                if remaining <= 0:
                    break
                if candidate not in used:
                    units.append((series, candidate))
                    remaining -= 1
            n = window_end + 1

    if remaining > 0:
        raise ValidationError({
            "quantity": "Not enough unused ticket numbers left — the remaining numbers in this series are already used by another series."
        })
    return units


def _resolve_stock_choice(request):
    """Returns (ticket_form_id, series_id) from a dispatch/roam request: a picked
    `series_id` pins both; a bare `ticket_form_id` keeps the FIFO-by-denomination draw."""
    series_id = request.data.get('series_id')
    if series_id:
        try:
            return TicketSeries.objects.get(id=series_id).ticket_form_id, series_id
        except (TicketSeries.DoesNotExist, ValueError, TypeError):
            raise ValidationError({"series_id": "Ticket series not found."})
    return request.data.get('ticket_form_id'), None


def _check_terminal_price(vehicle, total):
    """Total collected must equal the vehicle type's terminal price. A vehicle with no
    type has no price to check against, so it's refused outright rather than letting
    any amount through."""
    puv_type = vehicle.transportation_id
    if not puv_type:
        raise ValidationError({
            "vehicle_id": f"{vehicle.plate_number} has no vehicle type set — assign one in the Vehicle Registry before issuing tickets."
        })
    terminal_price = puv_type.terminal_price
    if terminal_price and total != terminal_price:
        raise ValidationError({
            "quantity": (
                f"Total collection amount (₱{total:.2f}) must match "
                f"the {puv_type.name} terminal price of ₱{terminal_price:.2f}."
            )
        })


def _check_plan(vehicle, plan):
    """A plan is [(ticket_form_id, quantity, series_id or None), ...]: one row per
    denomination handed out. Every form must exist and the rows must add up to the
    vehicle type's terminal price. Returns {form_id: TicketForm}."""
    form_ids = {form_id for form_id, _, _ in plan}
    forms = TicketForm.objects.in_bulk(form_ids)
    if not plan or len(forms) != len(form_ids):
        raise ValidationError({"ticket_form_id": "Ticket form not found."})
    _check_terminal_price(vehicle, sum((forms[form_id].price or 0) * quantity for form_id, quantity, _ in plan))
    return forms


def _draw_plan(vehicle, plan):
    """Checks the plan, then draws every row's ticket numbers FIFO. Call inside
    transaction.atomic(). Returns [(series, ticket_id, price)]."""
    forms = _check_plan(vehicle, plan)
    return [
        (series, ticket_id, forms[form_id].price or 0)
        for form_id, quantity, series_id in plan
        for series, ticket_id in _consume_series_fifo(form_id, quantity, series_id)
    ]


def _checkout_personnel():
    """Name of the check-out Personnel on the Dispatch desk; no vehicle leaves without one."""
    name = DeskDuty.get_solo().checkout_name
    if not name:
        raise ValidationError({"detail": "Pick the check-out personnel on the Dispatch board first."})
    return name


def _finalize_queued_vehicle(vehicle, plan, mode, request):
    """Shared core of dispatch_ticket and convert_to_roam: draws the plan's physical
    ticket numbers FIFO, closes out the vehicle's open QUEUED placeholder, and
    frees up the loading zone for whoever's next in line. `mode` is 'QUEUE' for a
    normal front-of-line dispatch or 'UNLOAD' for a mid-queue roam conversion —
    the only real difference between the two flows.

    Returns the list of newly-created (already COLLECTED) Ticket rows.
    """
    checked_out_by_name = _checkout_personnel()

    with transaction.atomic():
        placeholder = Ticket.objects.select_for_update().filter(
            vehicle=vehicle, status='QUEUED',
        ).order_by('queue_rank', 'issued_at').first()
        if not placeholder:
            raise ValidationError({"vehicle_id": "No open ticket found for this vehicle."})

        units = _draw_plan(vehicle, plan)

        dispatched_at = timezone.now()
        issuance_group = placeholder.issuance_group or uuid.uuid4().hex
        driver = placeholder.driver
        route = placeholder.route
        loading_started_at = placeholder.loading_started_at
        checked_in_at = placeholder.issued_at
        checked_in_by_name = placeholder.checked_in_by_name
        active_user = request.user if request.user.is_authenticated else None

        placeholder.delete()
        KioskSession.objects.filter(vehicle=vehicle, status__in=KioskSession.OPEN_STATUSES).update(status='DONE')

        new_tickets = [
            Ticket.objects.create(
                id=ticket_id,
                vehicle=vehicle,
                driver=driver,
                active_user=active_user,
                route=route,
                mode=mode,
                series=series,
                status='COLLECTED',
                is_verified=True,
                collection_amount=price,
                dispatched_at=dispatched_at,
                checked_out_at=dispatched_at,
                loading_started_at=loading_started_at,
                checked_in_at=checked_in_at,
                checked_in_by_name=checked_in_by_name,
                checked_out_by_name=checked_out_by_name,
                issuance_group=issuance_group,
            )
            for series, ticket_id, price in units
        ]

        vehicle.status = 'AVAILABLE'
        vehicle.save(update_fields=['status', 'updated_at'])

        # Whoever is now first in line for this route (if anyone) just
        # reached the loading zone as a result of this vehicle leaving. The
        # SMS is sent async, after commit, so this request doesn't block on
        # PhilSMS's HTTP round trip.
        if route:
            promote_queue_front(route)
            new_first = Ticket.objects.filter(
                route=route, mode='QUEUE', status='QUEUED',
            ).order_by('queue_rank', 'issued_at').first()
            if new_first:
                message = queue_next_message(route.full_name)
                transaction.on_commit(lambda: send_sms_async(new_first.driver.contact, message))

    return new_tickets


def _check_can_issue(vehicle, driver):
    """Shared by roam issuance and kiosk check-in: can this driver take this vehicle out?"""
    if vehicle.status != 'AVAILABLE':
        raise ValidationError({"vehicle_id": f"Vehicle is {vehicle.status} — cannot issue ticket."})
    if driver.status != 'ACTIVE':
        raise ValidationError({"driver_id": "Selected driver is not active."})
    if vehicle.franchise_expired:
        raise ValidationError({"vehicle_id": f"{vehicle.plate_number}'s franchise has expired."})
    if driver.iwp_expired:
        raise ValidationError({"driver_id": "Selected driver's IWP has expired."})


def _issue_roam_tickets(vehicle, driver, plan, request, depart=True):
    """Roam core: the toll is paid on the spot, so tickets are born COLLECTED. Draws
    numbers through the same FIFO allocator dispatch uses, so the two paths can't
    hand out the same number. `depart=False` is a kiosk roam numbered at check-in: it is
    paid but still inside, and leaves on its next scan (see kiosk_scan)."""
    checked_out_by_name = _checkout_personnel() if depart else ''
    _check_can_issue(vehicle, driver)

    with transaction.atomic():
        units = _draw_plan(vehicle, plan)

        dispatched_at = timezone.now()
        # A kiosk roam visit has been open since its scan; a front-desk roam is instant.
        visit = KioskSession.objects.filter(
            vehicle=vehicle, mode='ROAM', status__in=KioskSession.OPEN_STATUSES,
        ).first()
        desk = DeskDuty.get_solo()
        checked_in_at = visit.created_at if visit else dispatched_at
        checked_in_by_name = visit.checked_in_by_name if visit else desk.checkin_name
        issuance_group = uuid.uuid4().hex
        active_user = request.user if request.user.is_authenticated else None

        new_tickets = [
            Ticket.objects.create(
                id=ticket_id,
                vehicle=vehicle,
                driver=driver,
                active_user=active_user,
                route=vehicle.route,
                mode='UNLOAD',
                series=series,
                status='COLLECTED',
                is_verified=True,
                collection_amount=price,
                dispatched_at=dispatched_at,
                checked_out_at=dispatched_at if depart else None,
                checked_in_at=checked_in_at,
                checked_in_by_name=checked_in_by_name,
                checked_out_by_name=checked_out_by_name,
                issuance_group=issuance_group,
            )
            for series, ticket_id, price in units
        ]

        vehicle.active_driver = driver
        vehicle.save(update_fields=['active_driver', 'updated_at'])
        if depart:
            KioskSession.objects.filter(vehicle=vehicle, status__in=KioskSession.OPEN_STATUSES).update(status='DONE')

    return new_tickets


class TicketViewSet(viewsets.ModelViewSet):
    queryset = Ticket.objects.select_related(
        'vehicle', 'vehicle__route', 'vehicle__active_driver', 'vehicle__transportation_id',
        'driver', 'series', 'series__ticket_form',
    )
    serializer_class = TicketSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status__in=[s.strip() for s in status_param.split(',') if s.strip()])
        mode_param = self.request.query_params.get('mode')
        if mode_param:
            qs = qs.filter(mode__in=[m.strip() for m in mode_param.split(',') if m.strip()])
        vehicle_id = self.request.query_params.get('vehicle_id')
        if vehicle_id:
            qs = qs.filter(vehicle_id=vehicle_id)
        driver_id = self.request.query_params.get('driver_id')
        if driver_id:
            qs = qs.filter(driver_id=driver_id)
        route_origin = self.request.query_params.get('route_origin')
        if route_origin:
            qs = qs.filter(route__origin=route_origin)
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        if start_date:
            try:
                qs = qs.filter(created_at__gte=parse_date_start(start_date))
            except ValueError:
                pass
        if end_date:
            try:
                qs = qs.filter(created_at__lte=parse_date_end(end_date))
            except ValueError:
                pass
        search = self.request.query_params.get('search', '').strip()
        if search:
            # Matches the Ticket ID / Vehicle / Driver / Issued By columns actually
            # shown in the Collection Log table (src/app/dashboard/collection),
            # plus a status-word shortcut ("collected").
            condition = (
                Q(id__icontains=search)
                | Q(vehicle__plate_number__icontains=search)
                | Q(driver__first_name__icontains=search)
                | Q(driver__last_name__icontains=search)
                | Q(active_user_name__icontains=search)
                | Q(queue_code__icontains=search)
                | Q(route__origin__icontains=search)
            )
            lowered = search.lower()
            # Prefix match, min length 3, so a short substring like "an" can't pull in
            # every collected ticket.
            if len(lowered) >= 3 and 'collected'.startswith(lowered):
                condition |= Q(status='COLLECTED')
            qs = qs.filter(condition)
        return qs

    def perform_create(self, serializer):
        if WipMode.get_solo().is_active:
            raise ValidationError({"detail": "Ticket issuance is temporarily paused for a data backfill."})
        if self.request.user and self.request.user.is_authenticated:
            serializer.save(active_user=self.request.user)
        else:
            serializer.save()

    def list(self, request, *args, **kwargs):
        expire_stale_kiosk_sessions()

        # Backfilled batches share one created_at, so break ties newest-ticket-first —
        # by id length then id, since ids are numeric strings ("9" must sort below "14503").
        paged = paginate_request(
            request, self.get_queryset().order_by('-created_at', Length('id').desc(), '-id'),
        )
        if paged is not None:
            page_num, page_size, total, sliced = paged
            serializer = self.get_serializer(sliced, many=True)
            return Response({
                'results': serializer.data,
                'count': total,
                'page': page_num,
                'page_size': page_size,
                'total_pages': max((total + page_size - 1) // page_size, 1),
            })

        return super().list(request, *args, **kwargs)

    @action(detail=False, methods=['post'], url_path='dispatch')
    def dispatch_ticket(self, request):
        """Give out the physical ticket(s) for a queued vehicle: the dispatcher picks a
        denomination and quantity, and this auto-draws the oldest stock (FIFO across
        series) instead of letting a specific series be hand-picked."""
        if WipMode.get_solo().is_active:
            raise ValidationError({"detail": "Ticket issuance is temporarily paused for a data backfill."})

        vehicle_id = request.data.get('vehicle_id')
        ticket_form_id, series_id = _resolve_stock_choice(request)

        if not vehicle_id or not ticket_form_id:
            raise ValidationError({"vehicle_id": "vehicle_id and a ticket series (or ticket_form_id) are required."})
        try:
            quantity = max(1, int(request.data.get('quantity')))
        except (TypeError, ValueError):
            raise ValidationError({"quantity": "Quantity must be a whole number."})

        try:
            vehicle = Vehicle.objects.get(id=vehicle_id)
        except Vehicle.DoesNotExist:
            raise ValidationError({"vehicle_id": "Vehicle not found."})

        new_tickets = _finalize_queued_vehicle(vehicle, [(ticket_form_id, quantity, series_id)], 'QUEUE', request)
        return Response(
            TicketSerializer(new_tickets, many=True, context={'request': request}).data
        )

    @action(detail=False, methods=['post'], url_path='convert-to-roam')
    def convert_to_roam(self, request):
        """Let a queued vehicle skip the rest of the line: the driver pays the
        terminal fee now (same FIFO ticket draw as a normal dispatch) and leaves
        immediately, instead of waiting for their turn. Unlike dispatch_ticket,
        this is allowed from any position in the queue, not just the front."""
        if WipMode.get_solo().is_active:
            raise ValidationError({"detail": "Ticket issuance is temporarily paused for a data backfill."})

        vehicle_id = request.data.get('vehicle_id')
        ticket_form_id, series_id = _resolve_stock_choice(request)

        if not vehicle_id or not ticket_form_id:
            raise ValidationError({"vehicle_id": "vehicle_id and a ticket series (or ticket_form_id) are required."})
        try:
            quantity = max(1, int(request.data.get('quantity')))
        except (TypeError, ValueError):
            raise ValidationError({"quantity": "Quantity must be a whole number."})

        try:
            vehicle = Vehicle.objects.get(id=vehicle_id)
        except Vehicle.DoesNotExist:
            raise ValidationError({"vehicle_id": "Vehicle not found."})

        new_tickets = _finalize_queued_vehicle(vehicle, [(ticket_form_id, quantity, series_id)], 'UNLOAD', request)
        return Response(
            TicketSerializer(new_tickets, many=True, context={'request': request}).data
        )

    @action(detail=False, methods=['post'], url_path='reorder-queue')
    def reorder_queue(self, request):
        """Persist a manual drag-and-drop reorder of a route's queue line. The
        caller sends the complete new vehicle order for that route; every
        queued ticket's queue_rank is rewritten to match so every connected
        client (and promote_queue_front) sorts the line the same way."""
        route_id = request.data.get('route_id')
        vehicle_ids = request.data.get('vehicle_ids')
        reason = str(request.data.get('reason') or '').strip()
        if not route_id or not isinstance(vehicle_ids, list) or not vehicle_ids:
            raise ValidationError({"vehicle_ids": "route_id and a non-empty vehicle_ids list are required."})

        with transaction.atomic():
            current = list(
                Ticket.objects.select_for_update()
                .filter(route_id=route_id, mode='QUEUE', status='QUEUED')
                .order_by('queue_rank', 'issued_at')
            )
            current_by_vehicle = {t.vehicle_id: t for t in current}
            if set(vehicle_ids) != set(current_by_vehicle.keys()):
                raise ValidationError({
                    "vehicle_ids": "This route's queue changed since it was loaded — refresh and try again."
                })

            # Changing who sits in the loading bay (#1) needs a stated reason, on the record.
            bay_changed = current[0].vehicle_id != vehicle_ids[0]
            if bay_changed and not reason:
                raise ValidationError({"reason": "A reason is required to swap the vehicle in the loading bay."})
            if bay_changed:
                current[0].bay_swap_reason = reason[:255]
                current[0].save(update_fields=['bay_swap_reason', 'updated_at'])
                record_audit_log(
                    user=request.user,
                    action='UPDATE',
                    model_name='Ticket',
                    object_id=current[0].id,
                    object_repr=f"Loading-bay swap: {current[0].vehicle} replaced by {current_by_vehicle[vehicle_ids[0]].vehicle}",
                    changes={'reason': reason},
                )

            for rank, vehicle_id in enumerate(vehicle_ids):
                ticket = current_by_vehicle[vehicle_id]
                if ticket.queue_rank != rank:
                    ticket.queue_rank = rank
                    ticket.save(update_fields=['queue_rank', 'updated_at'])

            route = Route.objects.filter(id=route_id).first()
            if route:
                promote_queue_front(route)

        return Response({"status": "ok"})

    @action(detail=False, methods=['post'], url_path='extend-loading')
    def extend_loading(self, request):
        """Give the vehicle in a route's loading bay (#1) more time before its
        estimated departure. Only the front ticket carries an estimate, so the
        extension is added to its extra_loading_minutes."""
        route_id = request.data.get('route_id')
        try:
            minutes = int(request.data.get('minutes'))
        except (TypeError, ValueError):
            minutes = 0
        if not route_id or minutes not in (5, 10, 15):
            raise ValidationError({"minutes": "route_id and minutes (5, 10 or 15) are required."})

        with transaction.atomic():
            front = (
                Ticket.objects.select_for_update()
                .filter(route_id=route_id, mode='QUEUE', status='QUEUED')
                .order_by('queue_rank', 'issued_at')
                .first()
            )
            if not front:
                raise ValidationError({"route_id": "No vehicle is queued on this route."})
            front.extra_loading_minutes += minutes
            front.save(update_fields=['extra_loading_minutes', 'updated_at'])
            record_audit_log(
                user=request.user,
                action='UPDATE',
                model_name='Ticket',
                object_id=front.id,
                object_repr=f"Loading time extended +{minutes} min: {front.vehicle}",
                changes={'extra_loading_minutes': front.extra_loading_minutes},
            )
        return Response({"extra_loading_minutes": front.extra_loading_minutes})

    @action(detail=False, methods=['post'], url_path='roam')
    def roam_ticket(self, request):
        """Issue ticket(s) for a vehicle that's roaming, not queued: the toll is paid
        on the spot, so the ticket is born already COLLECTED. Draws physical ticket
        numbers the same FIFO way dispatch does, so the two paths can't hand out
        the same number — see _consume_series_fifo."""
        if WipMode.get_solo().is_active:
            raise ValidationError({"detail": "Ticket issuance is temporarily paused for a data backfill."})

        vehicle_id = request.data.get('vehicle_id')
        driver_id = request.data.get('driver_id')
        ticket_form_id = request.data.get('ticket_form_id')

        if not vehicle_id or not driver_id or not ticket_form_id:
            raise ValidationError({"vehicle_id": "vehicle_id, driver_id, and ticket_form_id are required."})
        try:
            quantity = max(1, int(request.data.get('quantity')))
        except (TypeError, ValueError):
            raise ValidationError({"quantity": "Quantity must be a whole number."})

        try:
            vehicle = Vehicle.objects.get(id=vehicle_id)
        except Vehicle.DoesNotExist:
            raise ValidationError({"vehicle_id": "Vehicle not found."})
        try:
            driver = Driver.objects.get(id=driver_id)
        except Driver.DoesNotExist:
            raise ValidationError({"driver_id": "Driver not found."})
        try:
            ticket_form = TicketForm.objects.get(id=ticket_form_id)
        except TicketForm.DoesNotExist:
            raise ValidationError({"ticket_form_id": "Ticket form not found."})

        new_tickets = _issue_roam_tickets(vehicle, driver, [(ticket_form.id, quantity, None)], request)
        return Response(
            TicketSerializer(new_tickets, many=True, context={'request': request}).data
        )

    def perform_update(self, serializer):
        was_verified = serializer.instance.is_verified
        ticket = serializer.save()

        # Ticket issuance/status changes already appear in the Terminal Queue Log —
        # the audit trail only needs to capture who verified/collected a ticket.
        if ticket.is_verified and not was_verified:
            record_audit_log(
                user=self.request.user,
                action='UPDATE',
                model_name='Ticket',
                object_id=ticket.id,
                object_repr=f"Verified {ticket}",
                changes={'is_verified': True, 'status': ticket.status},
            )

    @action(detail=True, methods=['post'])
    def reassign_driver(self, request, pk=None):
        """Swap the driver on a vehicle that's still waiting in queue (open/QUEUED ticket)."""
        ticket = self.get_object()
        if ticket.status != 'QUEUED':
            raise ValidationError("Only an open (QUEUED) ticket's driver can be reassigned.")

        driver_id = request.data.get('driver_id')
        if not driver_id:
            raise ValidationError({"driver_id": "This field is required."})

        try:
            new_driver = Driver.objects.get(id=driver_id)
        except Driver.DoesNotExist:
            raise ValidationError({"driver_id": "Driver not found."})

        if new_driver.status != 'ACTIVE':
            raise ValidationError({"driver_id": "Selected driver is not active and cannot be assigned."})

        conflict = Ticket.objects.filter(driver=new_driver, status='QUEUED').exclude(vehicle=ticket.vehicle).exists()
        if conflict:
            raise ValidationError({"driver_id": "This driver already has an active ticket on another vehicle."})

        old_driver = ticket.driver
        vehicle = ticket.vehicle

        with transaction.atomic():
            siblings = Ticket.objects.filter(vehicle=vehicle, status='QUEUED')
            if ticket.issuance_group:
                siblings = siblings.filter(issuance_group=ticket.issuance_group)
            else:
                siblings = siblings.filter(pk=ticket.pk)
            siblings.update(driver=new_driver)

            vehicle.active_driver = new_driver
            vehicle.save(update_fields=['active_driver', 'updated_at'])

        record_audit_log(
            user=request.user,
            action='UPDATE',
            model_name='Ticket',
            object_id=ticket.id,
            object_repr=f"Reassigned driver on {ticket}",
            changes={'driver': f"{old_driver} -> {new_driver}"},
        )

        ticket.refresh_from_db()
        return Response(TicketSerializer(ticket, context={'request': request}).data)


class TicketPriceViewSet(OfflineSettingWriteMixin, AuditLogMixin, viewsets.ModelViewSet):
    queryset = TicketPrice.objects.all()
    serializer_class = TicketPriceSerializer


class PUVTypeViewSet(OfflineSettingWriteMixin, ArchivableSettingMixin, AuditLogMixin, viewsets.ModelViewSet):
    queryset = PUVType.objects.all()
    serializer_class = PUVTypeSerializer
    usage = {'vehicle_count': ('vehicles', 'vehicle(s)')}


class TicketFormViewSet(OfflineSettingWriteMixin, AuditLogMixin, viewsets.ModelViewSet):
    queryset = TicketForm.objects.all()
    serializer_class = TicketFormSerializer


class RequisitionViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = Requisition.objects.all()
    serializer_class = RequisitionSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        if start_date:
            try:
                qs = qs.filter(date_requested__gte=parse_date_start(start_date))
            except ValueError:
                pass
        if end_date:
            try:
                qs = qs.filter(date_requested__lte=parse_date_end(end_date))
            except ValueError:
                pass
        is_archived = self.request.query_params.get('is_archived')
        if is_archived is not None:
            qs = qs.filter(is_archived=is_archived.lower() in ('1', 'true', 'yes'))
        return qs

    def list(self, request, *args, **kwargs):
        paged = paginate_request(request, self.get_queryset().order_by('-date_requested'))
        if paged is not None:
            page_num, page_size, total, sliced = paged
            serializer = self.get_serializer(sliced, many=True)
            return Response({
                'results': serializer.data,
                'count': total,
                'page': page_num,
                'page_size': page_size,
                'total_pages': max((total + page_size - 1) // page_size, 1),
            })
        return super().list(request, *args, **kwargs)

    def perform_create(self, serializer):
        # Starts unvalidated unless a supervisor is the one entering it; otherwise a supervisor
        # validates it before its series can be used.
        status = 'APPROVED' if self.request.user.role == 'SUPERVISOR' else 'PENDING'
        requisition = serializer.save(
            issued_by_name=self.request.user.display_name, issued_by_role=self.request.user.role, status=status)
        self._audit('CREATE', requisition, self._safe_changes())

    def perform_update(self, serializer):
        status = serializer.validated_data.get('status')
        if status is not None and status != serializer.instance.status:
            if self.request.user.role != 'SUPERVISOR':
                raise PermissionDenied('Only a supervisor can validate a requisition.')
            if status != 'APPROVED':
                raise ValidationError({'status': 'A requisition can only be validated.'})
        return super().perform_update(serializer)


class TicketSeriesViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = TicketSeries.objects.all()  # kept for router basename inference
    serializer_class = TicketSeriesSerializer

    def get_queryset(self):
        today = date.today()
        return TicketSeries.objects.filter(requisition__is_archived=False).select_related(
            'ticket_form', 'issued_to'
        ).prefetch_related('paper_issuances').annotate(
            _total_issued=Count('tickets'),
            _issued_before_today=Count('tickets', filter=Q(tickets__issued_at__date__lt=today)),
        )

    def get_permissions(self):
        # Correcting a mis-keyed series is a lead action; reads stay open.
        if self.action in ('update', 'partial_update'):
            return [IsAuthenticated(), IsSupervisorOrAdminForWrite()]
        return super().get_permissions()

    @staticmethod
    def _in_use(series):
        start, end = int(series.start_no), int(series.end_no)
        return Ticket.objects.filter(series=series).exists() or series.paper_issuances.exists() or any(
            i.isdigit() and start <= int(i) <= end for i in Ticket.objects.values_list('id', flat=True)
        )

    def perform_update(self, serializer):
        """Fix a mis-keyed series in place. Once the range has been used only End No. may change
        (not below the last used number); series_no and the amounts are rebuilt from the
        corrected numbers and form price."""
        with transaction.atomic():
            instance = serializer.instance
            if self._in_use(instance):
                data = serializer.validated_data
                if int(data.get('start_no', instance.start_no)) != int(instance.start_no):
                    raise ValidationError({"start_no": "Start No. can't be changed once tickets have been issued from this series."})
                last_used = serializer.get_last_used_no(instance)
                if last_used is not None and int(data.get('end_no', instance.end_no)) < last_used:
                    raise ValidationError({"end_no": f"End No. can't be lower than {last_used}, the last number already used."})
            series = serializer.save()
            series.series_no = f"{series.start_no}-{series.end_no}"
            series.total_value = series.ticket_form.price * (int(series.end_no) - int(series.start_no) + 1)
            series.save(update_fields=['series_no', 'total_value'])
            requisition = series.requisition
            requisition.total_value = sum(s.total_value for s in requisition.ticket_series.all())
            requisition.save(update_fields=['total_value', 'updated_at'])
            self._audit('UPDATE', series, self._safe_changes())

    @action(detail=True, methods=['post'], permission_classes=[IsAuthenticated, IsSupervisorOrAdminForWrite])
    def void(self, request, pk=None):
        """Undo a mis-keyed series so its numbers can be entered again. Only allowed while
        nothing has used the range; deleting (not flagging) is what frees both the
        unique series_no and the overlap check. The audit entry keeps the history."""
        with transaction.atomic():
            series = self.get_object()
            if self._in_use(series):
                raise ValidationError("This series already has issued tickets or a paper range, so it can't be deleted.")

            requisition = series.requisition
            record_audit_log(
                user=request.user, action='DELETE', model_name='TicketSeries', object_id=series.pk,
                object_repr=f"Deleted {series}",
                changes={'voided': True, 'total_value': str(series.total_value), 'requisition': requisition.pk},
            )
            series.delete()

            remaining = requisition.ticket_series.all()
            if remaining:
                requisition.total_value = sum(s.total_value for s in remaining)
                requisition.save(update_fields=['total_value', 'updated_at'])
            else:
                requisition.delete()
        return Response(status=204)


class PaperIssuanceViewSet(AuditLogMixin, viewsets.ModelViewSet):
    """Physical tickets handed out outside the system. Admin/Supervisor write; an
    already-remitted range is locked, since its amount is part of a filed batch."""
    queryset = PaperIssuance.objects.select_related('series__ticket_form')
    serializer_class = PaperIssuanceSerializer
    permission_classes = [IsAuthenticated, IsSupervisorOrAdminForWrite]
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get('unremitted'):
            qs = qs.filter(remittance_batch__isnull=True)
        for param in ('series', 'used_on'):
            value = self.request.query_params.get(param)
            if value:
                qs = qs.filter(**{param: value})
        return qs

    @action(detail=False, methods=['get'], url_path='next-free')
    def next_free(self, request):
        """Lowest number in `series` not yet used by a system ticket or paper range —
        prefills the form's From field so staff only type the last number."""
        series = TicketSeries.objects.filter(pk=request.query_params.get('series')).first()
        if not series:
            raise ValidationError({"series": "Unknown series."})
        start, end = int(series.start_no), int(series.end_no)
        used = {int(i) for i in Ticket.objects.filter(series=series).values_list('id', flat=True) if i.isdigit()}
        used |= paper_numbers_by_series([series.id]).get(series.id, set())
        free = next((n for n in range(start, end + 1) if n not in used), None)
        return Response({'next_free': free})

    def perform_create(self, serializer):
        user = self.request.user
        name = f"{user.first_name} {user.last_name}".strip() or user.username
        instance = serializer.save(recorded_by=user, recorded_by_name=name)
        self._audit('CREATE', instance, self._safe_changes())

    def perform_destroy(self, instance):
        if instance.remittance_batch_id:
            raise ValidationError("This range is already part of a remittance batch and can't be removed.")
        super().perform_destroy(instance)


class RemittanceBatchViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = RemittanceBatch.objects.all()
    serializer_class = RemittanceBatchSerializer

    @action(detail=True, methods=["get"], url_path="export-xlsx")
    def export_xlsx(self, request, pk=None):
        batch = self.get_object()
        serialized = self.get_serializer(batch).data
        return remittance_xlsx_response(batch, serialized)
