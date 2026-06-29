from django.urls import include, path
from rest_framework.routers import DefaultRouter
from django.conf import settings
from django.conf.urls.static import static
from .views import UserViewSet, DriverViewSet, VehicleViewSet, RouteViewSet, TicketViewSet, CurrentUserView, TicketPriceViewSet, PUVTypeViewSet, RemittanceBatchViewSet, TicketFormViewSet, DenominationViewSet, RequisitionViewSet, TicketSeriesViewSet, RoamingLogViewSet
from .views import report_summary, report_collections, report_daily_chart, transaction_logs, dashboard_stats, public_queue,vehicle_records,driver_records, server_time, issue_late_ticket, schedules_view, export_collections_csv, remittance_batches, reward_summary, reward_history, reward_redemptions, reward_redeem, reward_leaderboard

router = DefaultRouter()
router.register(r'users', UserViewSet)
router.register(r'drivers', DriverViewSet)
router.register(r'routes', RouteViewSet)
router.register(r'vehicles', VehicleViewSet)
router.register(r'tickets', TicketViewSet)
router.register(r'ticketPrice', TicketPriceViewSet)
router.register(r'puvtypes', PUVTypeViewSet, basename="puvtypes")
router.register(r'remittance', RemittanceBatchViewSet)
router.register(r'ticket-forms', TicketFormViewSet)
router.register(r'denominations', DenominationViewSet)
router.register(r'requisitions', RequisitionViewSet)
router.register(r'ticket-series', TicketSeriesViewSet)
router.register(r'roaming-logs', RoamingLogViewSet)

urlpatterns = [
    path("tickets/late/", issue_late_ticket),
    path('', include(router.urls)),
    path('report/summary/', report_summary),
    path('report/collections/', report_collections),
    path('report/chart/', report_daily_chart),
    path('logs/', transaction_logs),
    path('vehicles/records/', vehicle_records),
    path('drivers/records/', driver_records),
    path('dashboard/stats/', dashboard_stats),
    path('queue/', public_queue),
    path('current-user/', CurrentUserView.as_view(), name='current-user'),
    path('server-time/', server_time),
    path('schedules/', schedules_view),
    path("report/collections/export/", export_collections_csv, name="export_collections_csv"),
    path("report/remittance/", remittance_batches, name="remittance_batches"),
    path("rewards/<int:driver_id>/", reward_summary, name="reward_summary"),
    path("rewards/<int:driver_id>/history/", reward_history, name="reward_history"),
    path("rewards/<int:driver_id>/redemptions/", reward_redemptions, name="reward_redemptions"),
    path("rewards/<int:driver_id>/redeem/", reward_redeem, name="reward_redeem"),
    path("rewards/leaderboard/", reward_leaderboard, name="reward_leaderboard"),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)