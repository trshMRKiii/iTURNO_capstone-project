from django.urls import include, path
from rest_framework.routers import DefaultRouter
from django.conf import settings
from django.conf.urls.static import static
from .views import UserViewSet, DriverViewSet, VehicleViewSet, RouteViewSet, TicketViewSet, CurrentUserView, TicketPriceViewSet, PUVTypeViewSet, RemittanceBatchViewSet, TicketFormViewSet, RequisitionViewSet, TicketSeriesViewSet, PaperIssuanceViewSet
from .views import report_summary, report_collections, report_daily_chart, eod_reconciliation, audit_logs, dashboard_stats, dashboard_busiest, route_analytics, public_queue, server_time, supervisors, export_collections_csv, remittance_batches, amend_remittance_batch, system_backups, system_backup_settings, system_backup_detail, system_backup_download, system_backup_restore, system_backup_restore_upload, forgot_password, reset_password, change_password, wip_mode_config, backfill_batch, backfill_preview, backfill_import, backfill_history, backfill_history_detail, backfill_history_download, external_remittance, external_remittance_records, undo_external_remittance, kiosk_scan, kiosk_check_in, kiosk_sessions, kiosk_cancel, desk_duty

router = DefaultRouter()
router.register(r'users', UserViewSet)
router.register(r'drivers', DriverViewSet)
router.register(r'routes', RouteViewSet)
router.register(r'vehicles', VehicleViewSet)
router.register(r'tickets', TicketViewSet)

router.register(r'puvtypes', PUVTypeViewSet, basename="puvtypes")
router.register(r'remittance', RemittanceBatchViewSet)
router.register(r'ticket-forms', TicketFormViewSet)
router.register(r'requisitions', RequisitionViewSet)
router.register(r'ticket-series', TicketSeriesViewSet)
router.register(r'paper-issuances', PaperIssuanceViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('report/summary/', report_summary),
    path('report/collections/', report_collections),
    path('report/chart/', report_daily_chart),
    path('report/eod-reconciliation/', eod_reconciliation),
    path('report/route-analytics/', route_analytics),
    path('audit-logs/', audit_logs),
    path('dashboard/stats/', dashboard_stats),
    path('dashboard/busiest/', dashboard_busiest),
    path('queue/', public_queue),
    path('kiosk/scan/', kiosk_scan),
    path('kiosk/check-in/', kiosk_check_in),
    path('kiosk/sessions/', kiosk_sessions),
    path('desk-duty/', desk_duty),
    path('kiosk/cancel/', kiosk_cancel),
    path('current-user/', CurrentUserView.as_view(), name='current-user'),
    path('server-time/', server_time),
    path('supervisors/', supervisors),
    path("report/collections/export/", export_collections_csv, name="export_collections_csv"),
    path("report/remittance/", remittance_batches, name="remittance_batches"),
    path("report/remittance/<int:batch_id>/amend/", amend_remittance_batch, name="amend_remittance_batch"),
    path("report/remittance/external/", external_remittance, name="external_remittance"),
    path("report/remittance/external/records/", external_remittance_records, name="external_remittance_records"),
    path("report/remittance/external/<int:batch_id>/", undo_external_remittance, name="undo_external_remittance"),
    path("settings/wip-mode/", wip_mode_config, name="wip_mode_config"),
    path("backfill/batch/", backfill_batch, name="backfill_batch"),
    path("backfill/preview/", backfill_preview, name="backfill_preview"),
    path("backfill/import/", backfill_import, name="backfill_import"),
    path("backfill/history/", backfill_history, name="backfill_history"),
    path("backfill/history/<int:record_id>/", backfill_history_detail, name="backfill_history_detail"),
    path("backfill/history/<int:record_id>/download/", backfill_history_download, name="backfill_history_download"),
    path("system/backups/", system_backups, name="system_backups"),
    path("system/backups/settings/", system_backup_settings, name="system_backup_settings"),
    path("system/backups/<int:backup_id>/", system_backup_detail, name="system_backup_detail"),
    path("system/backups/<int:backup_id>/download/", system_backup_download, name="system_backup_download"),
    path("system/backups/<int:backup_id>/restore/", system_backup_restore, name="system_backup_restore"),
    path("system/backups/restore-upload/", system_backup_restore_upload, name="system_backup_restore_upload"),
    path("auth/forgot-password/", forgot_password, name="forgot_password"),
    path("auth/reset-password/", reset_password, name="reset_password"),
    path("auth/change-password/", change_password, name="change_password"),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)