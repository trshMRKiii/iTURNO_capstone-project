from rest_framework import serializers
from .models import User, Driver, Vehicle, Route, Ticket, TicketPrice, PUVType, Route, RemittanceBatch, Deposit, Collection, TicketForm, Denomination, Requisition, TicketSeries, RoamingLog


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name',
            'role', 'is_active', 'password',
        ]
        extra_kwargs = {
            'password': {'write_only': True, 'required': False},
            'username': {'required': False},
            'email': {'required': False}
        }

    def create(self, validated_data):
        password = validated_data.pop('password', None)
        user = User(
            username=validated_data['username'],
            email=validated_data['email'],
            first_name=validated_data.get('first_name', ''),
            last_name=validated_data.get('last_name', ''),
            role=validated_data.get('role', 'PERSONNEL'),
            is_active=validated_data.get('is_active', True),
        )
        if password:
            user.set_password(password)
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop('password', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


class DriverSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()

    class Meta:
        model = Driver
        fields = [
            'id', 'iwp_number', 'last_name', 'first_name', 'middle_name',
            'gender', 'birthdate', 'province', 'city', 'barangay', 'street', 'photo',
            'contact', 'status', 'is_archived', 'created_at', 'updated_at', 'name'
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
            'id', 'code', 'plate_number', 'transportation_id', 'transportation_name', 'franchise_number',
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
    active_user_name = serializers.CharField(
        source='active_user.username', read_only=True, required=False, allow_null=True
    )
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

        vehicle = Vehicle.objects.get(id=vehicle_id)

        if not driver_id and vehicle.active_driver_id:
            driver_id = vehicle.active_driver_id

        driver = Driver.objects.get(id=driver_id)

        series = None
        if series_id:
            series = TicketSeries.objects.get(id=series_id)
            start = int(series.start_no)
            end = int(series.end_no)
            if start >= end:
                raise serializers.ValidationError({"series_id": "This ticket series is depleted."})
            series.start_no = str(start + 1)
            series.save(update_fields=['start_no', 'updated_at'])

        return Ticket.objects.create(vehicle=vehicle, driver=driver, series=series, **validated_data)

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

    class Meta:
        model = Route
        fields = ['id', 'origin', 'is_active', 'created_at', 'updated_at', 'full_name']

    def get_full_name(self, obj):
        return f"{obj.origin} - San Fernando"
    
class TicketFormSerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketForm
        fields = ['id', 'name', 'price']

class DenominationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Denomination
        fields = ['id', 'value', 'label', 'type']

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

    class Meta:
        model = TicketSeries
        fields = [
            'id', 'series_no', 'ticket_form', 'ticket_form_label', 'ticket_form_price',
            'pad_no', 'box_no', 'start_no', 'end_no', 'qty',
            'unit_value', 'total_value', 'requisition',
            'issued_to', 'issued_to_name', 'date_issued',
            'created_at', 'updated_at',
        ]


class RequisitionSerializer(serializers.ModelSerializer):
    ticket_series = TicketSeriesSerializer(many=True, read_only=True)
    requested_by_name = serializers.CharField(source='requested_by.username', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.username', read_only=True, allow_null=True)

    class Meta:
        model = Requisition
        fields = [
            'id', 'date_requested', 'requested_by', 'requested_by_name',
            'approved_by', 'approved_by_name', 'status', 'total_value',
            'ticket_series', 'created_at', 'updated_at',
        ]


class RoamingLogSerializer(serializers.ModelSerializer):
    vehicle_plate = serializers.CharField(source='vehicle.plate_number', read_only=True)
    driver_name = serializers.SerializerMethodField()
    recorded_by_name = serializers.CharField(source='recorded_by.username', read_only=True, allow_null=True)

    class Meta:
        model = RoamingLog
        fields = ['id', 'vehicle', 'vehicle_plate', 'driver', 'driver_name', 'recorded_by', 'recorded_by_name', 'notes', 'recorded_at']
        extra_kwargs = {
            'recorded_by': {'read_only': True},
        }

    def get_driver_name(self, obj):
        if obj.driver:
            return f"{obj.driver.last_name}, {obj.driver.first_name}".strip()
        return None

class RemittanceBatchSerializer(serializers.ModelSerializer):
    collections = CollectionSerializer(many=True)
    deposits = DepositSerializer(many=True)

    class Meta:
        model = RemittanceBatch
        fields = "__all__"
