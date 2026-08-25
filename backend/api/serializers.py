from datetime import datetime, timedelta

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from django.utils.crypto import get_random_string
from rest_framework import serializers
from rest_framework.validators import UniqueValidator
from .models import User, Driver, Vehicle, Route, Ticket, TicketPrice, PUVType, Route, RemittanceBatch, Deposit, Collection, TicketForm, Requisition, TicketSeries, RoamingLog, AuditLog, BackupRecord, TerminalPrice, WipMode


class UserSerializer(serializers.ModelSerializer):
    username = serializers.EmailField(
        error_messages={'invalid': 'Enter a valid email address.'},
        validators=[UniqueValidator(queryset=User.objects.all(), message='A user with that email already exists.')],
    )

    class Meta:
        model = User
        fields = [
            'id', 'username', 'first_name', 'middle_name', 'last_name',
            'role', 'is_active', 'must_reset_password',
        ]
        extra_kwargs = {
            'must_reset_password': {'read_only': True},
        }

    def create(self, validated_data):
        user = User(
            username=validated_data['username'],
            first_name=validated_data.get('first_name', ''),
            middle_name=validated_data.get('middle_name', ''),
            last_name=validated_data.get('last_name', ''),
            role=validated_data.get('role', 'PERSONNEL'),
            is_active=validated_data.get('is_active', True),
            must_reset_password=True,
        )
        raw_password = get_random_string(12)
        user.set_password(raw_password)
        user.save()
        # Transient attribute, not persisted — read by the view to send the welcome email.
        user._generated_password = raw_password
        return user


class DriverSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()

    class Meta:
        model = Driver
        fields = [
            'id', 'iwp_number', 'last_name', 'first_name', 'middle_name',
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
    route_detail = RouteSerializer(source='route', read_only=True)
    transportation_name = serializers.CharField(source='transportation_id.name', read_only=True, allow_null=True)

    class Meta:
        model = Vehicle
        fields = [
            'id', 'plate_number', 'transportation_id', 'transportation_name', 'franchise_number',
            'route', 'route_detail', 'operator_address', 'qr_code',
            'status', 'active_driver', 'active_driver_name',
            'is_archived', 'created_at', 'updated_at',
        ]

    def get_active_driver_name(self, obj):
        if obj.active_driver:
            return f"{obj.active_driver.last_name}, {obj.active_driver.first_name}".strip()
        return None


class TicketSeriesBriefSerializer(serializers.ModelSerializer):
    ticket_form_label = serializers.CharField(source='ticket_form.name', read_only=True, allow_null=True)
    ticket_form_price = serializers.DecimalField(source='ticket_form.price', read_only=True, allow_null=True, max_digits=10, decimal_places=2)

    class Meta:
        model = TicketSeries
        fields = ['id', 'series_no', 'ticket_form', 'ticket_form_label', 'ticket_form_price', 'start_no', 'end_no']


class TicketSerializer(serializers.ModelSerializer):
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

            series = None
            if series_id:
                series = TicketSeries.objects.get(id=series_id)
                start = int(series.start_no)
                end = int(series.end_no)
                if start >= end:
                    raise serializers.ValidationError({"series_id": "This ticket series is depleted."})
                series.start_no = str(start + 1)
                series.save(update_fields=['start_no', 'updated_at'])

            if is_roam:
                # Roam check-in is also check-out — the toll is paid on the spot
                # and the vehicle roams off again, so the ticket is born already
                # collected with no queue/dispatch step.
                validated_data['status'] = 'COLLECTED'
                validated_data['is_verified'] = True
                validated_data['dispatched_at'] = timezone.now()
            elif not is_continuation:
                # Queue check-ins get a route-acronym + daily bay number
                # (e.g. "SJ-1"), counted per route and reset every midnight.
                route = vehicle.route
                if route:
                    today = timezone.localtime().date()
                    count_today = Ticket.objects.filter(
                        mode='QUEUE', route=route, issued_at__date=today,
                    ).count()
                    validated_data['queue_code'] = f"{route.acronym}-{count_today + 1}"

            ticket = Ticket.objects.create(vehicle=vehicle, driver=driver, series=series, **validated_data)

            if is_roam:
                vehicle.active_driver = driver
                vehicle.save(update_fields=['active_driver', 'updated_at'])
            else:
                vehicle.status = 'QUEUED'
                vehicle.active_driver = driver
                vehicle.save(update_fields=['status', 'active_driver', 'updated_at'])

        return ticket

class TicketPriceSerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketPrice
        fields = ['id', 'amount', 'effective_date']

class PUVTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = PUVType
        fields = ['id', 'name']

class RouteSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    checked_in_today = serializers.SerializerMethodField()
    revenue_in_range = serializers.SerializerMethodField()

    class Meta:
        model = Route
        fields = ['id', 'origin', 'is_active', 'created_at', 'updated_at', 'full_name', 'checked_in_today', 'revenue_in_range']

    def get_full_name(self, obj):
        return f"{obj.origin} - San Fernando"

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

class TerminalPriceSerializer(serializers.ModelSerializer):
    class Meta:
        model = TerminalPrice
        fields = ['id', 'amount', 'updated_at']

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

class TicketSeriesSerializer(serializers.ModelSerializer):
    ticket_form_label = serializers.CharField(source='ticket_form.name', read_only=True, allow_null=True)
    ticket_form_price = serializers.DecimalField(source='ticket_form.price', read_only=True, allow_null=True, max_digits=10, decimal_places=2)
    issued_to_name = serializers.CharField(source='issued_to.username', read_only=True, allow_null=True)
    beginning = serializers.SerializerMethodField()
    remaining = serializers.SerializerMethodField()

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
        original = self._get_original_pcs(obj)
        if hasattr(obj, '_total_issued'):
            total_issued = obj._total_issued
        else:
            total_issued = self._get_tickets_issued(obj)
        return max(original - total_issued, 0)

    class Meta:
        model = TicketSeries
        fields = [
            'id', 'series_no', 'ticket_form', 'ticket_form_label', 'ticket_form_price',
            'pad_no', 'box_no', 'start_no', 'end_no',
            'unit_value', 'total_value', 'requisition',
            'issued_to', 'issued_to_name', 'date_issued',
            'beginning', 'remaining',
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

    class Meta:
        model = Requisition
        fields = [
            'id', 'date_requested', 'requested_by', 'requested_by_name',
            'approved_by_name', 'status', 'total_value', 'is_archived',
            'ticket_series', 'created_at', 'updated_at',
        ]


class RoamingLogSerializer(serializers.ModelSerializer):
    vehicle_plate = serializers.CharField(source='vehicle.plate_number', read_only=True)
    driver_name = serializers.SerializerMethodField()
    recorded_by_name = serializers.SerializerMethodField()

    class Meta:
        model = RoamingLog
        fields = ['id', 'vehicle', 'vehicle_plate', 'driver', 'driver_name', 'recorded_by', 'recorded_by_name', 'notes', 'recorded_at']
        extra_kwargs = {
            'recorded_by': {'read_only': True},
        }

    def get_recorded_by_name(self, obj):
        user = obj.recorded_by
        if not user:
            return None
        full = f"{user.first_name} {user.last_name}".strip()
        return full or user.username

    def get_driver_name(self, obj):
        if obj.driver:
            return f"{obj.driver.last_name}, {obj.driver.first_name}".strip()
        return None

class AuditLogSerializer(serializers.ModelSerializer):
    user_name = serializers.SerializerMethodField()
    action_display = serializers.CharField(source='get_action_display', read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            'id', 'user', 'user_name', 'action', 'action_display',
            'model_name', 'object_id', 'object_repr', 'changes', 'created_at',
        ]

    def get_user_name(self, obj):
        user = obj.user
        if not user:
            return 'System'
        full = f"{user.first_name} {user.last_name}".strip()
        return full or user.username


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
