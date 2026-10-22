import io
import json
import os
from datetime import datetime

from django.apps import apps
from django.conf import settings
from django.core import management
from django.core.files.storage import FileSystemStorage
from django.db import connection, transaction
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import BasePermission
from rest_framework.response import Response

from ..models import AuditLog, BackupRecord, BackupSettings, SyncQueue, User
from ..serializers import BackupRecordSerializer, BackupSettingsSerializer
from ..sync.pause import paused
from ..sync.registry import PUSH_MODELS
from ..sync.signals import bulk_load
from ..ws.broadcast import broadcast_queue_updated
from .helpers import record_audit_log

SCHEDULED_LABEL = "Scheduled backup"
backup_storage = FileSystemStorage(location=settings.BASE_DIR / "backup")


class IsSuperAdmin(BasePermission):
    """Backup/restore can wipe and reload the entire database — SUPERADMIN only, reads included."""

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == "SUPERADMIN")


# The audit trail is history of what happened *to* the system (including backups and
# restores), so a rollback must never rewind or erase it.
NOT_BACKED_UP = (BackupRecord, BackupSettings, AuditLog)


def _backup_models():
    """Every api-app model that a backup captures and a restore replaces."""
    return [m for m in apps.get_app_config("api").get_models() if m not in NOT_BACKED_UP]


def _create_backup_file(user, label="", source="MANUAL"):
    buffer = io.StringIO()
    management.call_command(
        "dumpdata", *(f"api.{m.__name__}" for m in _backup_models()), indent=2, stdout=buffer, natural_foreign=False,
    )
    content = buffer.getvalue().encode("utf-8")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"backup_{timestamp}.json"
    saved_name = backup_storage.save(filename, io.BytesIO(content))

    record = BackupRecord.objects.create(
        filename=os.path.basename(saved_name),
        label=label,
        source=source,
        size_bytes=len(content),
        created_by=user if user and getattr(user, "is_authenticated", False) else None,
    )
    return record


@api_view(["GET", "POST"])
@permission_classes([IsSuperAdmin])
def system_backups(request):
    if request.method == "POST":
        label = (request.data.get("label") or "").strip()
        record = _create_backup_file(request.user, label=label, source="MANUAL")
        record_audit_log(
            user=request.user,
            action="CREATE",
            model_name="BackupRecord",
            object_id=record.pk,
            object_repr=record.filename,
            changes={"label": label},
        )
        return Response(BackupRecordSerializer(record).data, status=201)

    records = BackupRecord.objects.all()
    return Response({"backups": BackupRecordSerializer(records, many=True).data})


@api_view(["GET", "PUT"])
@permission_classes([IsSuperAdmin])
def system_backup_settings(request):
    current = BackupSettings.get_solo()
    if request.method == "GET":
        return Response(BackupSettingsSerializer(current).data)

    serializer = BackupSettingsSerializer(current, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    before = BackupSettingsSerializer(current).data
    serializer.save()
    record_audit_log(
        user=request.user,
        action="UPDATE",
        model_name="BackupSettings",
        object_id=current.pk,
        object_repr="Automatic backup settings",
        changes={k: {"old": before[k], "new": v} for k, v in serializer.data.items() if before[k] != v},
    )
    return Response(serializer.data)


@api_view(["DELETE"])
@permission_classes([IsSuperAdmin])
def system_backup_detail(request, backup_id):
    try:
        record = BackupRecord.objects.get(id=backup_id)
    except BackupRecord.DoesNotExist:
        return Response({"error": "Backup not found"}, status=404)

    path = record.filename
    if backup_storage.exists(path):
        backup_storage.delete(path)

    record_audit_log(
        user=request.user,
        action="DELETE",
        model_name="BackupRecord",
        object_id=record.pk,
        object_repr=record.filename,
    )
    record.delete()
    return Response(status=204)


@api_view(["GET"])
@permission_classes([IsSuperAdmin])
def system_backup_download(request, backup_id):
    try:
        record = BackupRecord.objects.get(id=backup_id)
    except BackupRecord.DoesNotExist:
        return Response({"error": "Backup not found"}, status=404)

    path = record.filename
    if not backup_storage.exists(path):
        return Response({"error": "Backup file missing on server"}, status=404)

    with backup_storage.open(path, "rb") as f:
        content = f.read()

    from django.http import HttpResponse
    response = HttpResponse(content, content_type="application/json")
    response["Content-Disposition"] = f'attachment; filename="{record.filename}"'
    return response


def _requeue_for_sync():
    """Queue every restored row for push in one pass (the per-row signals are muted during a restore)."""
    SyncQueue.objects.all().delete()
    entries = [
        SyncQueue(model_label=model._meta.label, object_id=str(pk))
        for model in PUSH_MODELS
        for pk in model.objects.values_list("pk", flat=True)
    ]
    SyncQueue.objects.bulk_create(entries, batch_size=500)


def _restore_from_content(content_bytes):
    """Wipe all backed-up api-app data and reload it from a dumpdata JSON payload."""
    # Older backups still carry audit rows; loading them would overwrite the live trail.
    skipped = {m._meta.label_lower for m in NOT_BACKED_UP}
    rows = [r for r in json.loads(content_bytes) if r.get("model") not in skipped]
    tmp_path = f"_restore_tmp_{datetime.now().strftime('%Y%m%d_%H%M%S%f')}.json"
    saved_name = backup_storage.save(tmp_path, io.BytesIO(json.dumps(rows).encode("utf-8")))
    full_path = backup_storage.path(saved_name)

    with paused():
        with connection.cursor() as cursor:
            cursor.execute("PRAGMA foreign_keys = OFF;")
        try:
            with transaction.atomic():
                with bulk_load():
                    for model in _backup_models():
                        # Raw delete: the normal collector would null AuditLog.user on every
                        # surviving audit row when users are wiped.
                        model.objects.all()._raw_delete(using=connection.alias)
                    management.call_command("loaddata", full_path)
                    # Rows that outlive the wipe must drop links to users the backup didn't have.
                    AuditLog.objects.exclude(user__in=User.objects.all()).update(user=None)
                    BackupRecord.objects.exclude(created_by__in=User.objects.all()).update(created_by=None)
                    _requeue_for_sync()
                transaction.on_commit(broadcast_queue_updated)
        finally:
            with connection.cursor() as cursor:
                cursor.execute("PRAGMA foreign_keys = ON;")
            if backup_storage.exists(saved_name):
                backup_storage.delete(saved_name)


@api_view(["POST"])
@permission_classes([IsSuperAdmin])
def system_backup_restore(request, backup_id):
    try:
        record = BackupRecord.objects.get(id=backup_id)
    except BackupRecord.DoesNotExist:
        return Response({"error": "Backup not found"}, status=404)

    path = record.filename
    if not backup_storage.exists(path):
        return Response({"error": "Backup file missing on server"}, status=404)

    with backup_storage.open(path, "rb") as f:
        content = f.read()

    # Safety snapshot of current state before overwriting it, so this restore can itself be undone.
    safety = _create_backup_file(request.user, label=f"Pre-restore snapshot (before restoring '{record.filename}')", source="AUTO")

    try:
        _restore_from_content(content)
    except Exception as e:
        return Response({"error": f"Restore failed: {e}", "safety_backup_id": safety.pk}, status=500)

    record_audit_log(
        user=request.user,
        action="UPDATE",
        model_name="System",
        object_id=record.pk,
        object_repr=f"Restored from {record.filename}",
        changes={"restored_backup_id": record.pk, "safety_backup_id": safety.pk},
    )
    return Response({
        "message": f"System restored from {record.filename}",
        "safety_backup_id": safety.pk,
    })


@api_view(["POST"])
@permission_classes([IsSuperAdmin])
def system_backup_restore_upload(request):
    file_obj = request.FILES.get("file")
    if not file_obj:
        return Response({"error": "No file provided"}, status=400)

    content = file_obj.read()
    try:
        json.loads(content)
    except Exception:
        return Response({"error": "Uploaded file is not valid JSON"}, status=400)

    safety = _create_backup_file(request.user, label=f"Pre-restore snapshot (before uploading '{file_obj.name}')", source="AUTO")

    try:
        _restore_from_content(content)
    except Exception as e:
        return Response({"error": f"Restore failed: {e}", "safety_backup_id": safety.pk}, status=500)

    record_audit_log(
        user=request.user,
        action="UPDATE",
        model_name="System",
        object_id="",
        object_repr=f"Restored from uploaded file {file_obj.name}",
        changes={"safety_backup_id": safety.pk},
    )
    return Response({
        "message": f"System restored from uploaded file {file_obj.name}",
        "safety_backup_id": safety.pk,
    })
