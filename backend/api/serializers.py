from datetime import datetime, timedelta

from django.conf import settings
from django.db import transaction
from django.db.models import Max, Sum
from django.utils import timezone
from django.utils.crypto import get_random_string
from rest_framework import serializers
from rest_framework.validators import UniqueValidator
from .models import User, Driver, Vehicle, Route, Ticket, TicketPrice, PUVType, Route, RemittanceBatch, Deposit, Collection, TicketForm, Requisition, TicketSeries, PaperIssuance, AuditLog, BackupRecord, BackupSettings, BackfillRecord, WipMode
from .sms import send_sms_async, queue_position_message
from .sync.settings_outbox import next_offline_pk, park


class SelfProfileSerializer(serializers.ModelSerializer):
    """What a signed-in user may change about themselves: never email, password or role."""
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    contact = serializers.RegexField(r'^\d{11}$', required=False, allow_blank=True,
                                     error_messages={'invalid': 'Contact number must be 11 digits.'})

    class Meta:
        model = User
        fields = ['first_name', 'middle_name', 'last_name', 'contact']


class UserSerializer(serializers.ModelSerializer):
    username = serializers.EmailField(
        error_messages={'invalid': 'Enter a valid email address.'},
        validators=[UniqueValidator(queryset=User.objects.all(), message='A user with that email already exists.')],
    )
    # True while the login email is still parked (offline); set by UserViewSet.perform_create.
    email_queued = serializers.SerializerMethodField()

    def get_email_queued(self, obj):
        return getattr(obj, 'email_queued', False)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'first_name', 'middle_name', 'last_name', 'contact',
            'role', 'is_active', 'must_reset_password', 'email_verified', 'can_manage_fleet',
            'email_queued',
        ]
        extra_kwargs = {
            'must_reset_password': {'read_only': True},
            'email_verified': {'read_only': True},
        }

    def create(self, validated_data):
        # Accounts are active immediately: a temp password is generated here and emailed by
        # UserViewSet.perform_create — no verification step first.
        from .views.helpers import save_user, supabase_reachable  # lazy: views imports this module
        raw_password = get_random_string(12)
        user = User(
            username=validated_data['username'],
            first_name=validated_data.get('first_name', ''),
            middle_name=validated_data.get('middle_name', ''),
            last_name=validated_data.get('last_name', ''),
            role=validated_data.get('role', 'PERSONNEL'),
            is_active=validated_data.get('is_active', True),
            can_manage_fleet=validated_data.get('can_manage_fleet', False),
            must_reset_password=True,
            email_verified=True,
        )
        user.set_password(raw_password)
        user.raw_password = raw_password
        # User is Supabase-authoritative (see api/sync/registry.py) — saving only to
        # 'default' would be deleted by the LAN's next pull cycle (DEBUG: local db).
        # Offline, it is saved locally under an id above LOCAL_ADMIN_PK_BASE and parked
        # so it is pushed under that same id once Supabase is back (see settings_outbox).
        if settings.DEBUG or supabase_reachable():
            save_user(user)
        else:
            user.pk = next_offline_pk(User)
            user.save(using='default')
            park(user)
        return user


class DriverSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    iwp_number = serializers.CharField(
        required=False,
        allow_blank=True,
        validators=[UniqueValidator(queryset=Driver.objects.all(), message='A driver with that IWP number already exists.')],
    )

    class Meta:
        model = Driver
        fields = [
            'id', 'iwp_number', 'iwp_expiration_date', 'last_name', 'first_name', 'middle_name',
            'gender', 'birthdate', 'province', 'city', 'barangay', 'street', 'photo',
            'contact', 'qr_code', 'status', 'is_archived', 'created_at', 'updated_at', 'name'
        ]

    def get_name(self, obj):
        return f"{obj.last_name}, {obj.first_name}".strip()


class RouteSerializer(serializers.ModelSerializer):
    full_name = serializers.ReadOnlyField()
    destination = serializers.ReadOnlyField(default=Route.DESTINATION)

    class Meta:
        model = Route
        fields = [
            'id', 'origin', 'full_name', 'destination',
            'is_active', 'created_at', 'updated_at',
        ]


class VehicleSerializer(serializers.ModelSerializer):
    active_driver_name = serializers.SerializerMethodField()
    owner_driver_name = serializers.SerializerMethodField()
    route_detail = RouteSerializer(source='route', read_only=True)
    transportation_name = serializers.CharField(source='transportation_id.name', read_only=True, allow_null=True)
    terminal_price = serializers.DecimalField(source='transportation_id.terminal_price', max_digits=10, decimal_places=2, read_only=True, allow_null=True)

    class Meta:
        model = Vehicle
        fields = [
            'id', 'plate_number', 'transportation_id', 'transportation_name', 'terminal_price', 'franchise_number',
            'franchise_expiration_date', 'route', 'route_detail', 'operator_address', 'qr_code',
            'status', 'owner_driver', 'owner_driver_name', 'active_driver', 'active_driver_name',
            'is_archived', 'created_at', 'updated_at',
        ]

    def get_active_driver_name(self, obj):
        if obj.active_driver:
            return f"{obj.active_driver.last_name}, {obj.active_driver.first_name}".strip()
        return None

    def get_owner_driver_name(self, obj):
        if obj.owner_driver:
            return f"{obj.owner_driver.last_name}, {obj.owner_driver.first_name}".strip()
        return None

    def validate_is_archived(self, value):
        if value and self.instance and self.instance.status == 'QUEUED':
            raise serializers.ValidationError('This vehicle is in the queue. Dispatch or remove it from the queue first.')
        return value

    def create(self, validated_data):
        # A freshly-registered vehicle has no shift history yet, so its
        # current driver starts out as its owner (mirrors the pre-split
        # behavior where setting "Active Operator" at creation applied
        # immediately) — unless the caller explicitly supplied one.
        if 'active_driver' not in validated_data and validated_data.get('owner_driver'):
            validated_data['active_driver'] = validated_data['owner_driver']
        return super().create(validated_data)


class TicketSeriesBriefSerializer(serializers.ModelSerializer):
    ticket_form_label = serializers.CharField(source='ticket_form.name', read_only=True, allow_null=True)
    ticket_form_price = serializers.DecimalField(source='ticket_form.price', read_only=True, allow_null=True, max_digits=10, decimal_places=2)

    class Meta:
        model = TicketSeries
        fields = ['id', 'series_no', 'ticket_form', 'ticket_form_label', 'ticket_form_price', 'start_no', 'end_no']


class TicketSerializer(serializers.ModelSerializer):
    # Declared explicitly (instead of letting ModelSerializer auto-generate it)
    # to skip DRF's automatic UniqueValidator — when series_id is given, create()
    # recomputes and overwrites this with the true next number anyway, so
    # validating the client's guess against the DB here would reject requests
    # that create() would have gone on to handle correctly.
    id = serializers.CharField(max_length=50)

    # For writing (creating): accept just IDs
    vehicle_id = serializers.IntegerField(write_only=True, required=True)
    driver_id = serializers.IntegerField(write_only=True, required=True)

    # For reading: return full nested objects
    vehicle = VehicleSerializer(read_only=True)
    driver = DriverSerializer(read_only=True)
    series = TicketSeriesBriefSerializer(read_only=True)
    series_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    active_user = serializers.StringRelatedField(read_only=True)
    active_user_name = serializers.SerializerMethodField()

    def get_active_user_name(self, obj):
        user = obj.active_user
        if not user:
            return None
        full = f"{user.first_name} {user.last_name}".strip()
        return full or user.username
    route_name = serializers.ReadOnlyField()

    class Meta:
        model = Ticket
        fields = '__all__'
        extra_kwargs = {
            'collection_amount': {'required': False}
        }
    
    def create(self, validated_data):
        vehicle_id = validated_data.pop('vehicle_id')
        driver_id = validated_data.pop('driver_id')
        series_id = validated_data.pop('series_id', None)
        issuance_group = validated_data.get('issuance_group', '')
        is_roam = validated_data.get('mode') == 'UNLOAD'

        with transaction.atomic():
            vehicle = Vehicle.objects.get(id=vehicle_id)

            if not driver_id and vehicle.active_driver_id:
                driver_id = vehicle.active_driver_id

            driver = Driver.objects.get(id=driver_id)

            open_tickets = list(Ticket.objects.filter(vehicle=vehicle, status='QUEUED'))
            # A quantity>1 issuance makes several sequential create() calls that share one
            # issuance_group — those are the same check-in, not a duplicate one.
            is_continuation = bool(issuance_group) and open_tickets and all(
                t.issuance_group == issuance_group for t in open_tickets
            )

            if open_tickets and not is_continuation:
                raise serializers.ValidationError(
                    {"vehicle_id": "This vehicle already has an open session — dispatch or cancel it before checking in again."}
                )

            if not is_continuation:
                if vehicle.status != 'AVAILABLE':
                    raise serializers.ValidationError(
                        {"vehicle_id": f"Vehicle is currently {vehicle.status} and cannot be checked in."}
                    )
                if driver.status != 'ACTIVE':
                    raise serializers.ValidationError(
                        {"driver_id": "Selected driver is not active and cannot be assigned."}
                    )
                if vehicle.franchise_expired:
                    raise serializers.ValidationError(
                        {"vehicle_id": f"{vehicle.plate_number}'s franchise has expired — renew it before checking in."}
                    )
                if driver.iwp_expired:
                    raise serializers.ValidationError(
                        {"driver_id": "Selected driver's IWP has expired — renew it before checking in."}
                    )

            series = None
            if series_id:
                # Same allocator dispatch uses, so every issuing path agrees on which
                # numbers are free (system tickets, legacy overlaps, paper ranges).
                # Imported here to avoid a circular import — views.viewsets imports
                # this module.
                from .views.viewsets import _consume_series_fifo
                series_form_id = TicketSeries.objects.values_list('ticket_form_id', flat=True).get(id=series_id)
                [(series, ticket_id)] = _consume_series_fifo(series_form_id, 1, series_id)
                validated_data['id'] = ticket_id

            if is_roam:
                # Roam check-in is also check-out — the toll is paid on the spot
                # and the vehicle roams off again, so the ticket is born already
                # collected with no queue/dispatch step.
                validated_data['status'] = 'COLLECTED'
                validated_data['is_verified'] = True
                validated_data['dispatched_at'] = validated_data['checked_in_at'] = timezone.now()
            elif not is_continuation:
                # Queue check-ins get a route-acronym + daily bay number
                # (e.g. "SJ-1"), counted per route and reset every midnight.
                route = vehicle.route
                if route:
                    # PH local day boundaries, not server-local (server TIME_ZONE is UTC)
                    # or issued_at__date (which extracts the date in the active/UTC
                    # timezone, not PH) — matches parse_date_start/parse_date_end in
                    # views/helpers.py.
                    now_ph = timezone.now() + timedelta(hours=8)
                    day_start = timezone.make_aware(
                        datetime(now_ph.year, now_ph.month, now_ph.day) - timedelta(hours=8)
                    )
                    day_end = day_start + timedelta(days=1)
                    count_today = Ticket.objects.filter(
                        mode='QUEUE', route=route, issued_at__gte=day_start, issued_at__lt=day_end,
                    ).count()
                    validated_data['queue_code'] = f"{route.acronym}-{count_today + 1}"

                    # New arrivals join at the back of the line — one past
                    # whatever rank (manually reordered or not) is currently
                    # highest for this route.
                    max_rank = Ticket.objects.filter(
                        route=route, mode='QUEUE', status='QUEUED',
                    ).aggregate(Max('queue_rank'))['queue_rank__max']
                    validated_data['queue_rank'] = 0 if max_rank is None else max_rank + 1

            ticket = Ticket.objects.create(vehicle=vehicle, driver=driver, series=series, **validated_data)

            if is_roam:
                vehicle.active_driver = driver
                vehicle.save(update_fields=['active_driver', 'updated_at'])
            else:
                vehicle.status = 'QUEUED'
                vehicle.active_driver = driver
                vehicle.save(update_fields=['status', 'active_driver', 'updated_at'])

                # One SMS per check-in (not per physical ticket unit, so a
                # quantity>1 continuation doesn't resend it), telling the
                # driver their spot in line. Skipped at position 1 — that
                # vehicle is already heading straight to the loading bay.
                # Sent async, after commit, so the check-in request doesn't
                # block on PhilSMS's HTTP round trip.
                if not is_continuation and route:
                    position = Ticket.objects.filter(
                        route=route, mode='QUEUE', status='QUEUED',
                    ).count()
                    if position > 1:
                        message = queue_position_message(position, route.full_name)
                        transaction.on_commit(lambda: send_sms_async(driver.contact, message))

            # Imported here (not at module level) to avoid a circular import —
            # views/helpers.py doesn't depend on serializers, but api.views'
            # package __init__ pulls in viewsets.py, which does. Uses
            # vehicle.route (not the local `route`, which is only bound in the
            # non-continuation branch above) so this is safe for every case.
            if not is_roam and vehicle.route:
                from .views.helpers import promote_queue_front
                promote_queue_front(vehicle.route)

        return ticket

class TicketPriceSerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketPrice
        fields = ['id', 'amount', 'effective_date']

class PUVTypeSerializer(serializers.ModelSerializer):
    # Annotated by PUVTypeViewSet.get_queryset so the archive confirm can show impact.
    vehicle_count = serializers.IntegerField(read_only=True, default=None)

    class Meta:
        model = PUVType
        fields = ['id', 'name', 'terminal_price', 'is_archived', 'vehicle_count']

class RouteSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    checked_in_today = serializers.SerializerMethodField()
    revenue_in_range = serializers.SerializerMethodField()
    avg_loading_minutes = serializers.SerializerMethodField()
    # Annotated by RouteViewSet.get_queryset so the archive confirm can show impact.
    vehicle_count = serializers.IntegerField(read_only=True, default=None)
    ticket_count = serializers.IntegerField(read_only=True, default=None)

    class Meta:
        model = Route
        fields = [
            'id', 'origin', 'is_active', 'is_archived', 'created_at', 'updated_at', 'full_name',
            'checked_in_today', 'revenue_in_range', 'estimated_loading_minutes',
            'avg_loading_minutes', 'vehicle_count', 'ticket_count',
        ]

    def get_full_name(self, obj):
        return obj.origin

    def get_avg_loading_minutes(self, obj):
        # Recent-history reference for whoever is setting estimated_loading_minutes —
        # computed on demand from the last 50 dispatches instead of a stored/rolling
        # average, so this stays cheap no matter how much ticket history piles up.
        recent = Ticket.objects.filter(
            route=obj, status='COLLECTED',
            loading_started_at__isnull=False, dispatched_at__isnull=False,
        ).order_by('-dispatched_at').values_list('dispatched_at', 'loading_started_at')[:50]
        durations = [(dispatched - started).total_seconds() for dispatched, started in recent]
        if not durations:
            return None
        return round((sum(durations) / len(durations)) / 60, 1)

    def _get_range(self):
        now_ph = timezone.now() + timedelta(hours=8)
        today_str = now_ph.strftime('%Y-%m-%d')

        request = self.context.get('request')
        start_date = today_str
        end_date = today_str
        if request:
            start_date = request.query_params.get('start_date') or today_str
            end_date = request.query_params.get('end_date') or today_str
            # A future "to" date can't tell us anything — clamp it to today.
            if end_date > today_str:
                end_date = today_str
            if start_date > end_date:
                start_date = end_date

        start_d = datetime.strptime(start_date, '%Y-%m-%d')
        end_d = datetime.strptime(end_date, '%Y-%m-%d')
        range_start = timezone.make_aware(
            datetime(start_d.year, start_d.month, start_d.day, 0, 0, 0) - timedelta(hours=8)
        )
        range_end = timezone.make_aware(
            datetime(end_d.year, end_d.month, end_d.day, 23, 59, 59) - timedelta(hours=8)
        )
        return range_start, range_end

    def get_checked_in_today(self, obj):
        range_start, range_end = self._get_range()
        return Ticket.objects.filter(
            route=obj, issued_at__gte=range_start, issued_at__lte=range_end
        ).values('vehicle_id').distinct().count()

    def get_revenue_in_range(self, obj):
        range_start, range_end = self._get_range()
        total = Ticket.objects.filter(
            route=obj, dispatched_at__isnull=False, dispatched_at__gte=range_start, dispatched_at__lte=range_end
        ).aggregate(s=Sum('collection_amount'))['s']
        return round(float(total or 0), 2)

class TicketFormSerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketForm
        fields = ['id', 'name', 'price']

class WipModeSerializer(serializers.ModelSerializer):
    class Meta:
        model = WipMode
        fields = ['id', 'is_active', 'updated_at']

class DepositSerializer(serializers.ModelSerializer):
    class Meta:
        model = Deposit
        fields = "__all__"

class CollectionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Collection
        fields = "__all__"

class PaperIssuanceSerializer(serializers.ModelSerializer):
    series_no = serializers.CharField(source='series.series_no', read_only=True)
    count = serializers.IntegerField(read_only=True)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    def validate(self, attrs):
        series, start, end = attrs['series'], attrs['from_no'], attrs['to_no']
        if start > end:
            raise serializers.ValidationError({"to_no": "End number must not be lower than the start number."})
        if not (int(series.start_no) <= start and end <= int(series.end_no)):
            raise serializers.ValidationError({"from_no": f"Range must sit inside series {series.series_no} ({series.start_no}–{series.end_no})."})
        used = Ticket.objects.filter(id__in=[str(n) for n in range(start, end + 1)]).values_list('id', flat=True)
        if used:
            raise serializers.ValidationError({"from_no": f"Ticket {min(used, key=int)} is already issued in the system."})
        clash = PaperIssuance.objects.filter(series=series, from_no__lte=end, to_no__gte=start).first()
        if clash:
            raise serializers.ValidationError({"from_no": f"Overlaps an earlier paper range ({clash.from_no}–{clash.to_no})."})
        return attrs

    class Meta:
        model = PaperIssuance
        fields = [
            'id', 'series', 'series_no', 'from_no', 'to_no', 'count', 'amount', 'used_on',
            'reason', 'note', 'recorded_by_name', 'remittance_batch', 'created_at',
        ]
        read_only_fields = ['recorded_by_name', 'remittance_batch']


class TicketSeriesSerializer(serializers.ModelSerializer):
    ticket_form_label = serializers.CharField(source='ticket_form.name', read_only=True, allow_null=True)
    ticket_form_price = serializers.DecimalField(source='ticket_form.price', read_only=True, allow_null=True, max_digits=10, decimal_places=2)
    issued_to_name = serializers.CharField(source='issued_to.username', read_only=True, allow_null=True)
    beginning = serializers.SerializerMethodField()
    remaining = serializers.SerializerMethodField()
    last_used_no = serializers.SerializerMethodField()

    def _get_original_pcs(self, obj):
        start = int(obj.start_no or 0)
        end = int(obj.end_no or 0)
        return max(end - start + 1, 0)

    def _get_tickets_issued(self, obj, before_date=None):
        qs = obj.tickets.all()
        if before_date:
            qs = qs.filter(issued_at__date__lt=before_date)
        return qs.count()

    def get_beginning(self, obj):
        from datetime import date
        original = self._get_original_pcs(obj)
        if hasattr(obj, '_issued_before_today'):
            tickets_before_today = obj._issued_before_today
        else:
            tickets_before_today = self._get_tickets_issued(obj, before_date=date.today())
        return max(original - tickets_before_today, 0)

    def get_remaining(self, obj):
        # Ticket.id is the printed number and is unique across every series, so a
        # number inside this range that another (legacy/overlapping) series already
        # issued is not available here either. Count free numbers, not just own issues.
        from bisect import bisect_left, bisect_right
        if not hasattr(self, '_used_numbers'):
            self._used_numbers = sorted(
                int(i) for i in Ticket.objects.values_list('id', flat=True) if str(i).isdigit()
            )
        start = int(obj.start_no or 0)
        end = int(obj.end_no or 0)
        used = bisect_right(self._used_numbers, end) - bisect_left(self._used_numbers, start)
        used += sum(p.count for p in obj.paper_issuances.all())
        return max(self._get_original_pcs(obj) - used, 0)

    def get_last_used_no(self, obj):
        """Highest number in this range already used, by a system ticket or a paper range."""
        self.get_remaining(obj)  # ensures self._used_numbers is loaded
        from bisect import bisect_right
        start, end = int(obj.start_no or 0), int(obj.end_no or 0)
        i = bisect_right(self._used_numbers, end)
        last = self._used_numbers[i - 1] if i and self._used_numbers[i - 1] >= start else None
        paper_last = max((p.to_no for p in obj.paper_issuances.all()), default=None)
        return max((n for n in (last, paper_last) if n is not None), default=None)

    def validate(self, attrs):
        # The column stays nullable (SET_NULL when a form is deleted, and legacy rows),
        # but a series can't be created or edited into having no ticket form.
        if 'ticket_form' in attrs or self.instance is None:
            if not attrs.get('ticket_form'):
                raise serializers.ValidationError({"ticket_form": "Ticket form is required."})

        # Ticket.id is the bare printed number and is the primary key across every
        # series (archived ones included), so a range that overlaps any other series
        # would later collide when those numbers are issued.
        start_no = attrs.get('start_no', getattr(self.instance, 'start_no', None))
        end_no = attrs.get('end_no', getattr(self.instance, 'end_no', None))
        try:
            start, end = int(start_no), int(end_no)
        except (TypeError, ValueError):
            raise serializers.ValidationError({"start_no": "Start and end numbers must be whole numbers."})
        if start > end:
            raise serializers.ValidationError({"end_no": "End number must not be lower than the start number."})

        others = TicketSeries.objects.exclude(pk=getattr(self.instance, 'pk', None))
        for other in others.only('series_no', 'start_no', 'end_no'):
            try:
                o_start, o_end = int(other.start_no), int(other.end_no)
            except (TypeError, ValueError):
                continue
            if start <= o_end and o_start <= end:
                raise serializers.ValidationError({
                    "start_no": f"Range {start}–{end} overlaps an existing series ({o_start}–{o_end}). Ticket numbers must be unique across all series."
                })

        # Ticket.id is the primary key, so a number already issued (by any series) can't be in this range.
        if self.instance is None or 'start_no' in attrs or 'end_no' in attrs:
            taken = next((i for i in Ticket.objects.values_list('id', flat=True) if str(i).isdigit() and start <= int(i) <= end), None)
            if taken is not None:
                raise serializers.ValidationError({"start_no": f"Ticket number {taken} in this range was already issued."})
        return attrs

    class Meta:
        model = TicketSeries
        fields = [
            'id', 'series_no', 'ticket_form', 'ticket_form_label', 'ticket_form_price',
            'start_no', 'end_no',
            'unit_value', 'total_value', 'requisition',
            'issued_to', 'issued_to_name', 'date_issued',
            'beginning', 'remaining', 'last_used_no',
            'created_at', 'updated_at',
        ]


class RequisitionSerializer(serializers.ModelSerializer):
    ticket_series = TicketSeriesSerializer(many=True, read_only=True)
    requested_by_name = serializers.SerializerMethodField()

    def get_requested_by_name(self, obj):
        user = obj.requested_by
        if user:
            full = f"{user.first_name} {user.last_name}".strip()
            return full if full else user.username
        return None

    def validate_requested_by(self, user):
        if user is not None and user.role != 'SUPERVISOR':
            raise serializers.ValidationError("A requisition can only be requested by a supervisor.")
        return user

    def validate(self, attrs):
        if self.instance is None and not attrs.get('requested_by'):
            raise serializers.ValidationError({"requested_by": "Choose the supervisor who requested this."})
        return attrs

    class Meta:
        model = Requisition
        fields = [
            'id', 'date_requested', 'requested_by', 'requested_by_name',
            'issued_by_name', 'status', 'total_value', 'is_archived',
            'ticket_series', 'created_at', 'updated_at',
        ]
        read_only_fields = ['issued_by_name']


class AuditLogSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    action_display = serializers.CharField(source='get_action_display', read_only=True)
    backfill_id = serializers.SerializerMethodField()

    class Meta:
        model = AuditLog
        fields = [
            'id', 'user', 'user_name', 'action', 'action_display',
            'model_name', 'object_id', 'object_repr', 'changes', 'created_at', 'backfill_id',
        ]

    def get_backfill_id(self, obj):
        """The BackfillRecord this entry created, so the audit row can expand into its tickets.
        Newer entries store the id in `changes`; older ones are matched by author + timing
        (the record is written within moments of the audit entry)."""
        changes = obj.changes if isinstance(obj.changes, dict) else {}
        if changes.get('backfill_id'):
            return changes['backfill_id']
        if changes.get('source') != 'manual_backfill' and not obj.object_repr.startswith('CSV backfill'):
            return None
        near = timedelta(seconds=10)
        return BackfillRecord.objects.filter(
            created_by=obj.user, created_at__range=(obj.created_at - near, obj.created_at + near),
        ).order_by('created_at').values_list('id', flat=True).first()

    def get_user_name(self, obj):
        user = obj.user
        if not user:
            return 'System'
        full = f"{user.first_name} {user.last_name}".strip()
        return full or user.username


class BackupSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = BackupSettings
        fields = ['enabled', 'interval_days', 'keep_days']
        extra_kwargs = {
            'interval_days': {'min_value': 1, 'max_value': 90},
            'keep_days': {'min_value': 1, 'max_value': 365},
        }


class BackupRecordSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = BackupRecord
        fields = [
            'id', 'filename', 'label', 'source', 'size_bytes',
            'created_by', 'created_by_name', 'created_at',
        ]

    def get_created_by_name(self, obj):
        user = obj.created_by
        if not user:
            return 'System'
        full = f"{user.first_name} {user.last_name}".strip()
        return full or user.username


class BackfillRecordSerializer(serializers.ModelSerializer):
    has_csv = serializers.SerializerMethodField()

    class Meta:
        model = BackfillRecord
        fields = [
            'id', 'created_by', 'created_by_name',
            'ticket_count', 'reason', 'issued_at', 'csv_filename', 'has_csv', 'entries', 'created_at',
        ]

    def get_has_csv(self, obj):
        return bool(obj.csv_file)


class RemittanceBatchSerializer(serializers.ModelSerializer):
    collections = CollectionSerializer(many=True)
    deposits = DepositSerializer(many=True)
    issued_by_name = serializers.SerializerMethodField()

    class Meta:
        model = RemittanceBatch
        fields = "__all__"

    def get_issued_by_name(self, obj):
        if obj.issued_by:
            full = f"{obj.issued_by.first_name} {obj.issued_by.last_name}".strip()
            return full or obj.issued_by.username
        return ""
