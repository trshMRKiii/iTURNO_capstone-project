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

from ..models import LOCAL_ADMIN_PK_BASE, PendingAccountEmail, PendingFleetAccess, User, Driver, Vehicle, Route, Ticket, TicketPrice, PUVType, RemittanceBatch, TicketForm, Requisition, TicketSeries, PaperIssuance, WipMode
from ..serializers import UserSerializer, SelfProfileSerializer, DriverSerializer, VehicleSerializer, RouteSerializer, TicketSerializer, TicketPriceSerializer, PUVTypeSerializer, RemittanceBatchSerializer, TicketFormSerializer, RequisitionSerializer, TicketSeriesSerializer, PaperIssuanceSerializer
from ..sync.account_emails import flush_account_emails, queue_account_email
from ..sync.fleet_access import flush_fleet_access
from ..sync.settings_outbox import flush_settings, next_offline_pk, park, park_delete
from ..sms import send_sms_async, queue_next_message
from ..tokens import sign_email_verification_token
from .helpers import record_audit_log, expire_stale_queue_tickets, expire_stale_unverified_accounts, supabase_reachable, can_write_remote, remote_db, mirror_user, paper_numbers_by_series, parse_date_start, parse_date_end, paginate_request, promote_queue_front
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
                and getattr(self, 'action', None) != 'create' and not can_write_remote()):
            raise ServiceUnavailable('Staff accounts can only be changed while online. Reconnect to the internet and try again.')

    def get_queryset(self):
        qs = self._staff_queryset()
        # Supervisors/Managers only ever deal with Personnel here.
        return qs.filter(role='PERSONNEL') if self.request.user.role in LEAD_ROLES else qs

    def _staff_queryset(self):
        if not can_write_remote():
            return User.objects.using('default').all()
        # Lazy cleanup, same convention as expire_stale_queue_tickets — the
        # first Staff Registry fetch after an invite's 30-day window closes
        # self-heals it, no scheduler needed.
        expire_stale_unverified_accounts()
        # Accounts created offline sit parked locally until a sync cycle uploads them, and
        # this list reads Supabase — push them now so they don't vanish from it on reconnect.
        flush_settings()
        flush_account_emails()
        # Reads (and, via the auto-routing below, every write this viewset makes)
        # target Supabase directly rather than the local pulled cache — User is
        # Supabase-authoritative (see api/sync/registry.py), so a user created
        # here has to actually land there or the next pull cycle deletes the
        # LAN-only row before anyone can click its verification link. Fetching
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

    def perform_create(self, serializer):
        # The temp password only exists in the login email, so it is always parked first
        # and flushed: sent at once when online, kept (surviving restarts) until then.
        instance = super().perform_create(serializer)
        queue_account_email(instance, instance.raw_password)
        flush_account_emails()
        instance.email_queued = PendingAccountEmail.objects.filter(user_id=instance.pk).exists()
        return instance

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

    @action(detail=True, methods=['post'])
    def resend_verification(self, request, pk=None):
        user = self.get_object()
        if user.email_verified:
            return Response({'detail': 'This account is already verified.'}, status=400)
        send_verification_email(user)
        return Response({'detail': 'Verification email resent.'})


def send_verification_email(user):
    user_name = user.first_name or user.username
    # Raw pk, not base64 — matches the uid format api/remote/auth/[action].js's
    # verifyEmail expects, since this link always opens on Vercel (see
    # settings.PUBLIC_APP_URL) and that's what verifies it.
    uid = str(user.pk)
    token = sign_email_verification_token(user)
    verify_link = f"{settings.PUBLIC_APP_URL}/verify-email?uid={uid}&token={token}"
    text_body = (
        f"Hi {user_name},\n\n"
        "An account was created for you on the North Central Terminal management system. "
        "Verify your email to activate it:\n\n"
        f"{verify_link}\n\n"
        "This link is only good for this one account and expires if left unverified for 30 days."
    )
    html_body = render_to_string('emails/verify_account.html', {
        'user_name': user_name,
        'username': user.username,
        'verify_link': verify_link,
    })
    email = EmailMultiAlternatives(
        subject='Verify your North Central Terminal account',
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[user.username],
    )
    email.attach_alternative(html_body, 'text/html')
    email.send(fail_silently=False)


def send_new_account_email(user, raw_password):
    """Sent right after verify_email() confirms the address is real —
    hands over the temp password so the account can actually sign in."""
    user_name = user.first_name or user.username
    login_link = settings.PUBLIC_APP_URL
    text_body = (
        f"Hi {user_name},\n\n"
        "Your email has been verified. Use the temporary credentials below to sign in — "
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
        expire_stale_queue_tickets()
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
    )
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


def _check_terminal_price(vehicle, price, quantity):
    """Total collected (ticket price x quantity) must equal the vehicle type's terminal
    price. A vehicle with no type has no price to check against, so it's refused
    outright rather than letting any amount through."""
    puv_type = vehicle.transportation_id
    if not puv_type:
        raise ValidationError({
            "vehicle_id": f"{vehicle.plate_number} has no vehicle type set — assign one in the Vehicle Registry before issuing tickets."
        })
    terminal_price = puv_type.terminal_price
    if terminal_price and price * quantity != terminal_price:
        raise ValidationError({
            "quantity": (
                f"Total collection amount (₱{price * quantity:.2f}) must match "
                f"the {puv_type.name} terminal price of ₱{terminal_price:.2f}."
            )
        })


def _finalize_queued_vehicle(vehicle, ticket_form_id, quantity, mode, request, series_id=None):
    """Shared core of dispatch_ticket and convert_to_roam: draws `quantity` physical
    ticket numbers FIFO, closes out the vehicle's open QUEUED placeholder, and
    frees up the loading zone for whoever's next in line. `mode` is 'QUEUE' for a
    normal front-of-line dispatch or 'UNLOAD' for a mid-queue roam conversion —
    the only real difference between the two flows.

    Returns the list of newly-created (already COLLECTED) Ticket rows.
    """
    try:
        ticket_form = TicketForm.objects.get(id=ticket_form_id)
    except TicketForm.DoesNotExist:
        raise ValidationError({"ticket_form_id": "Ticket form not found."})

    with transaction.atomic():
        placeholder = Ticket.objects.select_for_update().filter(
            vehicle=vehicle, status='QUEUED',
        ).order_by('queue_rank', 'issued_at').first()
        if not placeholder:
            raise ValidationError({"vehicle_id": "No open ticket found for this vehicle."})

        price = ticket_form.price or 0
        _check_terminal_price(vehicle, price, quantity)

        units = _consume_series_fifo(ticket_form.id, quantity, series_id)

        dispatched_at = timezone.now()
        issuance_group = placeholder.issuance_group or uuid.uuid4().hex
        driver = placeholder.driver
        route = placeholder.route
        loading_started_at = placeholder.loading_started_at
        active_user = request.user if request.user.is_authenticated else None

        placeholder.delete()

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
                loading_started_at=loading_started_at,
                issuance_group=issuance_group,
            )
            for series, ticket_id in units
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
            # plus the same fuzzy status-substring shortcut the old client-side
            # filter had (typing "cancel" finds cancelled tickets, etc).
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
            # Prefix match (not "is search a substring of the word", which was backwards
            # and made any short substring of "cancelled" like "an"/"el" pull in every
            # cancelled ticket) — min length 3 so it only kicks in once the term is
            # unambiguously heading toward one of these two words.
            if len(lowered) >= 3 and 'cancelled'.startswith(lowered):
                condition |= Q(status='CANCELLED')
            if len(lowered) >= 3 and 'collected'.startswith(lowered):
                condition |= ~Q(status='CANCELLED')
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
        expire_stale_queue_tickets()

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

        new_tickets = _finalize_queued_vehicle(vehicle, ticket_form_id, quantity, 'QUEUE', request, series_id)
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

        new_tickets = _finalize_queued_vehicle(vehicle, ticket_form_id, quantity, 'UNLOAD', request, series_id)
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
        if not route_id or not isinstance(vehicle_ids, list) or not vehicle_ids:
            raise ValidationError({"vehicle_ids": "route_id and a non-empty vehicle_ids list are required."})

        with transaction.atomic():
            current = list(
                Ticket.objects.select_for_update()
                .filter(route_id=route_id, mode='QUEUE', status='QUEUED')
            )
            current_by_vehicle = {t.vehicle_id: t for t in current}
            if set(vehicle_ids) != set(current_by_vehicle.keys()):
                raise ValidationError({
                    "vehicle_ids": "This route's queue changed since it was loaded — refresh and try again."
                })

            for rank, vehicle_id in enumerate(vehicle_ids):
                ticket = current_by_vehicle[vehicle_id]
                if ticket.queue_rank != rank:
                    ticket.queue_rank = rank
                    ticket.save(update_fields=['queue_rank', 'updated_at'])

            route = Route.objects.filter(id=route_id).first()
            if route:
                promote_queue_front(route)

        return Response({"status": "ok"})

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

        if vehicle.status != 'AVAILABLE':
            raise ValidationError({"vehicle_id": f"Vehicle is {vehicle.status} — cannot issue ticket."})
        if driver.status != 'ACTIVE':
            raise ValidationError({"driver_id": "Selected driver is not active."})
        if vehicle.franchise_expired:
            raise ValidationError({"vehicle_id": f"{vehicle.plate_number}'s franchise has expired."})
        if driver.iwp_expired:
            raise ValidationError({"driver_id": "Selected driver's IWP has expired."})

        price = ticket_form.price or 0
        _check_terminal_price(vehicle, price, quantity)

        with transaction.atomic():
            units = _consume_series_fifo(ticket_form.id, quantity)

            dispatched_at = timezone.now()
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
                    issuance_group=issuance_group,
                )
                for series, ticket_id in units
            ]

            vehicle.active_driver = driver
            vehicle.save(update_fields=['active_driver', 'updated_at'])

        return Response(
            TicketSerializer(new_tickets, many=True, context={'request': request}).data
        )

    def perform_update(self, serializer):
        was_verified = serializer.instance.is_verified
        was_queued = serializer.instance.status == 'QUEUED'
        route = serializer.instance.route
        ticket = serializer.save()

        # A cancelled front-of-line ticket frees up the loading zone for
        # whoever's next — same promotion that happens on dispatch.
        if was_queued and ticket.status == 'CANCELLED' and route:
            promote_queue_front(route)

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
        user = self.request.user
        requisition = serializer.save(issued_by_name=f"{user.first_name} {user.last_name}".strip() or user.username)
        self._audit('CREATE', requisition, self._safe_changes())

    @action(detail=False, methods=['get'])
    def supervisors(self, request):
        """Who a requisition can be requested by. Open to anyone who can record one, since
        the staff list itself is limited to admins."""
        users = User.objects.filter(role='SUPERVISOR', is_active=True).order_by('first_name', 'last_name')
        return Response([
            {'id': u.id, 'name': f"{u.first_name} {u.last_name}".strip() or u.username} for u in users
        ])


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
        """Fix a mis-keyed series in place. Only allowed while nothing has used the range;
        series_no and the amounts are rebuilt from the corrected numbers and form price."""
        with transaction.atomic():
            if self._in_use(serializer.instance):
                raise ValidationError("This series already has issued tickets or a paper range, so it can't be edited.")
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
