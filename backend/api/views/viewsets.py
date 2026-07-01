from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from ..models import User, Driver, Vehicle, Route, Ticket, TicketPrice, PUVType, RemittanceBatch, TicketForm, Requisition, TicketSeries, RoamingLog
from ..serializers import UserSerializer, DriverSerializer, VehicleSerializer, RouteSerializer, TicketSerializer, TicketPriceSerializer, PUVTypeSerializer, RemittanceBatchSerializer, TicketFormSerializer, RequisitionSerializer, TicketSeriesSerializer, RoamingLogSerializer


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer


class DriverViewSet(viewsets.ModelViewSet):
    queryset = Driver.objects.all()
    serializer_class = DriverSerializer


class RouteViewSet(viewsets.ModelViewSet):
    queryset = Route.objects.all()
    serializer_class = RouteSerializer


class VehicleViewSet(viewsets.ModelViewSet):
    queryset = Vehicle.objects.all()
    serializer_class = VehicleSerializer


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


class TicketPriceViewSet(viewsets.ModelViewSet):
    queryset = TicketPrice.objects.all()
    serializer_class = TicketPriceSerializer


class PUVTypeViewSet(viewsets.ModelViewSet):
    queryset = PUVType.objects.all()
    serializer_class = PUVTypeSerializer


class TicketFormViewSet(viewsets.ModelViewSet):
    queryset = TicketForm.objects.all()
    serializer_class = TicketFormSerializer


class RequisitionViewSet(viewsets.ModelViewSet):
    queryset = Requisition.objects.all()
    serializer_class = RequisitionSerializer

    def perform_create(self, serializer):
        serializer.save(requested_by=self.request.user)


class TicketSeriesViewSet(viewsets.ModelViewSet):
    queryset = TicketSeries.objects.all()
    serializer_class = TicketSeriesSerializer


class RoamingLogViewSet(viewsets.ModelViewSet):
    queryset = RoamingLog.objects.all()
    serializer_class = RoamingLogSerializer

    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)


class RemittanceBatchViewSet(viewsets.ModelViewSet):
    queryset = RemittanceBatch.objects.all()
    serializer_class = RemittanceBatchSerializer
