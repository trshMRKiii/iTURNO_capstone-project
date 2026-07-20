import uuid

from django.core.files.uploadedfile import UploadedFile
from django.db import transaction
from django.utils import timezone
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import User, Driver, Vehicle, Route, Ticket, TicketPrice, PUVType, RemittanceBatch, TicketForm, Requisition, TicketSeries, RoamingLog, TerminalPrice
from ..serializers import UserSerializer, DriverSerializer, VehicleSerializer, RouteSerializer, TicketSerializer, TicketPriceSerializer, PUVTypeSerializer, RemittanceBatchSerializer, TicketFormSerializer, RequisitionSerializer, TicketSeriesSerializer, RoamingLogSerializer
from .helpers import record_audit_log, expire_stale_queue_tickets


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


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)


class UserViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer


class DriverViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = Driver.objects.all()
    serializer_class = DriverSerializer


class RouteViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = Route.objects.all()
    serializer_class = RouteSerializer


class VehicleViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = Vehicle.objects.all()
    serializer_class = VehicleSerializer

    def list(self, request, *args, **kwargs):
        expire_stale_queue_tickets(actor=request.user if request.user.is_authenticated else None)
        return super().list(request, *args, **kwargs)

    def perform_update(self, serializer):
        instance = serializer.save()
        # Vehicle status is patched constantly by ticketing/dispatch/roaming flows
        # (already reflected in Transaction/Roaming Logs) — only the full profile
        # edit form on the Vehicle Registry page (a PUT) belongs in the audit trail.
        if self.request.method == 'PUT':
            self._audit('UPDATE', instance, self._safe_changes())
        return instance


def _consume_series_fifo(ticket_form_id, quantity):
    """Assign `quantity` physical ticket numbers to a denomination, drawing from the
    oldest ticket series first and spilling into the next-oldest one as each depletes.

    Returns a list of (series, ticket_id) pairs of length `quantity` and advances each
    series' start_no as it's consumed. Raises ValidationError if stock runs out.
    """
    series_list = list(
        TicketSeries.objects.filter(ticket_form_id=ticket_form_id).order_by('requisition_id', 'id')
    )
    total_available = sum(
        max(int(s.end_no) - int(s.start_no) + 1, 0) for s in series_list
    )
    if quantity > total_available:
        raise ValidationError({
            "quantity": f"Only {total_available} ticket(s) remaining for this denomination."
        })

    units = []
    remaining = quantity
    for series in series_list:
        if remaining <= 0:
            break
        start = int(series.start_no)
        end = int(series.end_no)
        while remaining > 0 and start <= end:
            units.append((series, str(start)))
            start += 1
            remaining -= 1
        if str(start) != series.start_no:
            series.start_no = str(start)
            series.save(update_fields=['start_no', 'updated_at'])

    return units


class TicketViewSet(viewsets.ModelViewSet):
    queryset = Ticket.objects.all()
    serializer_class = TicketSerializer

    def perform_create(self, serializer):
        if self.request.user and self.request.user.is_authenticated:
            serializer.save(active_user=self.request.user)
        else:
            serializer.save()

    def list(self, request, *args, **kwargs):
        expire_stale_queue_tickets(actor=request.user if request.user.is_authenticated else None)
        return super().list(request, *args, **kwargs)

    @action(detail=False, methods=['post'], url_path='dispatch')
    def dispatch_ticket(self, request):
        """Give out the physical ticket(s) for a queued vehicle: the dispatcher picks a
        denomination and quantity, and this auto-draws the oldest stock (FIFO across
        series) instead of letting a specific series be hand-picked."""
        vehicle_id = request.data.get('vehicle_id')
        ticket_form_id = request.data.get('ticket_form_id')

        if not vehicle_id or not ticket_form_id:
            raise ValidationError({"vehicle_id": "vehicle_id and ticket_form_id are required."})
        try:
            quantity = max(1, int(request.data.get('quantity')))
        except (TypeError, ValueError):
            raise ValidationError({"quantity": "Quantity must be a whole number."})

        try:
            vehicle = Vehicle.objects.get(id=vehicle_id)
        except Vehicle.DoesNotExist:
            raise ValidationError({"vehicle_id": "Vehicle not found."})
        try:
            ticket_form = TicketForm.objects.get(id=ticket_form_id)
        except TicketForm.DoesNotExist:
            raise ValidationError({"ticket_form_id": "Ticket form not found."})

        with transaction.atomic():
            placeholder = Ticket.objects.select_for_update().filter(
                vehicle=vehicle, status='ISSUED',
            ).order_by('issued_at').first()
            if not placeholder:
                raise ValidationError({"vehicle_id": "No open ticket found for this vehicle."})

            price = ticket_form.price or 0
            terminal_price = TerminalPrice.get_solo().amount
            if terminal_price and price * quantity != terminal_price:
                raise ValidationError({
                    "quantity": (
                        f"Total collection amount (₱{price * quantity:.2f}) must match "
                        f"the terminal price of ₱{terminal_price:.2f}."
                    )
                })

            units = _consume_series_fifo(ticket_form.id, quantity)

            dispatched_at = timezone.now()
            issuance_group = placeholder.issuance_group or uuid.uuid4().hex
            driver = placeholder.driver
            route = placeholder.route
            mode = placeholder.mode
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
                    status='DISPATCHED',
                    collection_amount=price,
                    dispatched_at=dispatched_at,
                    issuance_group=issuance_group,
                )
                for series, ticket_id in units
            ]

            vehicle.status = 'AVAILABLE'
            vehicle.save(update_fields=['status', 'updated_at'])

        return Response(
            TicketSerializer(new_tickets, many=True, context={'request': request}).data
        )

    def perform_update(self, serializer):
        was_verified = serializer.instance.is_verified
        ticket = serializer.save()
        # Ticket issuance/status changes already appear in Transaction Logs —
        # the audit trail only needs to capture who verified/collected a ticket.
        if ticket.is_verified and not was_verified:
            record_audit_log(
                user=self.request.user,
                action='UPDATE',
                model_name='Ticket',
                object_id=ticket.id,
                object_repr=f"Verified ticket {ticket.id}",
                changes={'is_verified': True, 'status': ticket.status},
            )

    @action(detail=True, methods=['post'])
    def reassign_driver(self, request, pk=None):
        """Swap the driver on a vehicle that's still waiting in queue (open/ISSUED ticket)."""
        ticket = self.get_object()
        if ticket.status != 'ISSUED':
            raise ValidationError("Only an open (ISSUED) ticket's driver can be reassigned.")

        driver_id = request.data.get('driver_id')
        if not driver_id:
            raise ValidationError({"driver_id": "This field is required."})

        try:
            new_driver = Driver.objects.get(id=driver_id)
        except Driver.DoesNotExist:
            raise ValidationError({"driver_id": "Driver not found."})

        if new_driver.status != 'ACTIVE':
            raise ValidationError({"driver_id": "Selected driver is not active and cannot be assigned."})

        conflict = Ticket.objects.filter(driver=new_driver, status='ISSUED').exclude(vehicle=ticket.vehicle).exists()
        if conflict:
            raise ValidationError({"driver_id": "This driver already has an active ticket on another vehicle."})

        old_driver = ticket.driver
        vehicle = ticket.vehicle

        with transaction.atomic():
            siblings = Ticket.objects.filter(vehicle=vehicle, status='ISSUED')
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
            object_repr=f"Reassigned driver on ticket {ticket.id}",
            changes={'driver': f"{old_driver} -> {new_driver}"},
        )

        ticket.refresh_from_db()
        return Response(TicketSerializer(ticket, context={'request': request}).data)


class TicketPriceViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = TicketPrice.objects.all()
    serializer_class = TicketPriceSerializer


class PUVTypeViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = PUVType.objects.all()
    serializer_class = PUVTypeSerializer


class TicketFormViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = TicketForm.objects.all()
    serializer_class = TicketFormSerializer


class RequisitionViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = Requisition.objects.all()
    serializer_class = RequisitionSerializer

    def perform_create(self, serializer):
        requisition = serializer.save(requested_by=self.request.user)
        self._audit('CREATE', requisition, self._safe_changes())


class TicketSeriesViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = TicketSeries.objects.all()
    serializer_class = TicketSeriesSerializer


class RoamingLogViewSet(viewsets.ModelViewSet):
    queryset = RoamingLog.objects.all()
    serializer_class = RoamingLogSerializer

    def perform_create(self, serializer):
        vehicle = serializer.validated_data.get("vehicle")
        if vehicle and vehicle.status == "QUEUED":
            raise ValidationError("Vehicle is already in the queue — cannot log roaming.")
        serializer.save(recorded_by=self.request.user)


class RemittanceBatchViewSet(AuditLogMixin, viewsets.ModelViewSet):
    queryset = RemittanceBatch.objects.all()
    serializer_class = RemittanceBatchSerializer
