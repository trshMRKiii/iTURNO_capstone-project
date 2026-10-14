from django.contrib import admin
from .models import (
    User, Driver, Vehicle, Route, Ticket, Requisition, TicketSeries, PaperIssuance,
    TicketPrice, PUVType, TicketForm, WipMode, RemoteBackfillRequest, RemittanceBatch,
    Deposit, Collection, BackfillRecord, AuditLog, BackupRecord, PendingFleetAccess,
    PendingSetting, SyncQueue,
)
from .views.helpers import can_write_remote, remote_db


class ReadOnlyAdmin(admin.ModelAdmin):
    """Audit/sync bookkeeping rows are written by the app itself; hand edits here
    would falsify the trail or desync the LAN/Supabase mirror."""

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


class PulledModelAdmin(admin.ModelAdmin):
    """User/Route/prices/etc. are Supabase-authoritative (api/sync/registry.py): every
    pull cycle re-creates any row missing locally, so a delete here must hit Supabase
    too or the row comes straight back. Blocked offline for the same reason."""

    def has_delete_permission(self, request, obj=None):
        return can_write_remote() and super().has_delete_permission(request, obj)

    def delete_model(self, request, obj):
        if remote_db() != 'default':
            type(obj).objects.using(remote_db()).filter(pk=obj.pk).delete()
        super().delete_model(request, obj)

    def delete_queryset(self, request, queryset):
        if remote_db() != 'default':
            queryset.model.objects.using(remote_db()).filter(pk__in=list(queryset.values_list('pk', flat=True))).delete()
        super().delete_queryset(request, queryset)


admin.site.register([User, Route, TicketPrice, PUVType, TicketForm], PulledModelAdmin)
admin.site.register([
    Driver, Vehicle, Ticket, Requisition, TicketSeries, PaperIssuance,
    WipMode, RemoteBackfillRequest, RemittanceBatch, Deposit, Collection, BackfillRecord,
])
admin.site.register([AuditLog, BackupRecord, PendingFleetAccess, PendingSetting, SyncQueue], ReadOnlyAdmin)
