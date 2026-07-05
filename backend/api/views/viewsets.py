from django.core.files.uploadedfile import UploadedFile
from rest_framework import viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import User, Driver, Vehicle, Route, Ticket, TicketPrice, PUVType, RemittanceBatch, TicketForm, Requisition, TicketSeries, RoamingLog
from ..serializers import UserSerializer, DriverSerializer, VehicleSerializer, RouteSerializer, TicketSerializer, TicketPriceSerializer, PUVTypeSerializer, RemittanceBatchSerializer, TicketFormSerializer, RequisitionSerializer, TicketSeriesSerializer, RoamingLogSerializer
from .helpers import record_audit_log


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

    def perform_update(self, serializer):
        instance = serializer.save()
        # Vehicle status is patched constantly by ticketing/dispatch/roaming flows
        # (already reflected in Transaction/Roaming Logs) — only the full profile
        # edit form on the Vehicle Registry page (a PUT) belongs in the audit trail.
        if self.request.method == 'PUT':
            self._audit('UPDATE', instance, self._safe_changes())
        return instance


class TicketViewSet(viewsets.ModelViewSet):
    queryset = Ticket.objects.all()
    serializer_class = TicketSerializer

    def perform_create(self, serializer):
        if self.request.user and self.request.user.is_authenticated:
            ticket = serializer.save(active_user=self.request.user)
        else:
            ticket = serializer.save()

        from ..rewards import award_queue_point
        try:
            award_queue_point(ticket.driver)
        except Exception:
            import logging
            logging.getLogger(__name__).exception("award_queue_point failed for ticket %s", ticket.id)

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
