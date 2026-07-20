from django.urls import include, path
from rest_framework.routers import DefaultRouter
from django.conf import settings
from django.conf.urls.static import static
from .views import UserViewSet, DriverViewSet, VehicleViewSet, RouteViewSet, TicketViewSet, CurrentUserView, TicketPriceViewSet, PUVTypeViewSet, RemittanceBatchViewSet, TicketFormViewSet, RequisitionViewSet, TicketSeriesViewSet, RoamingLogViewSet
from .views import report_summary, report_collections, report_daily_chart, eod_reconciliation, transaction_logs, audit_logs, dashboard_stats, public_queue,vehicle_records,driver_records, server_time, export_collections_csv, remittance_batches, terminal_price_config, system_backups, system_backup_detail, system_backup_download, system_backup_restore, system_backup_restore_upload, forgot_password, reset_password

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
router.register(r'requisitions', RequisitionViewSet)
router.register(r'ticket-series', TicketSeriesViewSet)
router.register(r'roaming-logs', RoamingLogViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('report/summary/', report_summary),
    path('report/collections/', report_collections),
    path('report/chart/', report_daily_chart),
    path('report/eod-reconciliation/', eod_reconciliation),
    path('logs/', transaction_logs),
    path('audit-logs/', audit_logs),
    path('vehicles/records/', vehicle_records),
    path('drivers/records/', driver_records),
    path('dashboard/stats/', dashboard_stats),
    path('queue/', public_queue),
    path('current-user/', CurrentUserView.as_view(), name='current-user'),
    path('server-time/', server_time),
    path("report/collections/export/", export_collections_csv, name="export_collections_csv"),
    path("report/remittance/", remittance_batches, name="remittance_batches"),
    path("settings/terminal-price/", terminal_price_config, name="terminal_price_config"),
    path("system/backups/", system_backups, name="system_backups"),
    path("system/backups/<int:backup_id>/", system_backup_detail, name="system_backup_detail"),
    path("system/backups/<int:backup_id>/download/", system_backup_download, name="system_backup_download"),
    path("system/backups/<int:backup_id>/restore/", system_backup_restore, name="system_backup_restore"),
    path("system/backups/restore-upload/", system_backup_restore_upload, name="system_backup_restore_upload"),
    path("auth/forgot-password/", forgot_password, name="forgot_password"),
    path("auth/reset-password/", reset_password, name="reset_password"),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)