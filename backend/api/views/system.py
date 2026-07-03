import io
import os
from datetime import datetime

from django.apps import apps
from django.conf import settings
from django.core import management
from django.core.files.storage import default_storage
from django.db import connection, transaction
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import BackupRecord
from ..serializers import BackupRecordSerializer
from .helpers import record_audit_log

BACKUPS_DIR = "backups"


def _backup_app_labels():
    """All api-app models except BackupRecord itself, as 'api.Model' labels for dumpdata."""
    return [
        f"api.{model.__name__}"
        for model in apps.get_app_config("api").get_models()
        if model is not BackupRecord
    ]


def _backup_path(filename):
    return os.path.join(BACKUPS_DIR, filename)


def _create_backup_file(user, label="", source="MANUAL"):
    buffer = io.StringIO()
    management.call_command(
        "dumpdata", *_backup_app_labels(), indent=2, stdout=buffer, natural_foreign=False,
    )
    content = buffer.getvalue().encode("utf-8")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"backup_{timestamp}.json"
    saved_name = default_storage.save(_backup_path(filename), io.BytesIO(content))

    record = BackupRecord.objects.create(
        filename=os.path.basename(saved_name),
        label=label,
        source=source,
        size_bytes=len(content),
        created_by=user if user and getattr(user, "is_authenticated", False) else None,
    )
    return record


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
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


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def system_backup_detail(request, backup_id):
    try:
        record = BackupRecord.objects.get(id=backup_id)
    except BackupRecord.DoesNotExist:
        return Response({"error": "Backup not found"}, status=404)

    path = _backup_path(record.filename)
    if default_storage.exists(path):
        default_storage.delete(path)

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
@permission_classes([IsAuthenticated])
def system_backup_download(request, backup_id):
    try:
        record = BackupRecord.objects.get(id=backup_id)
    except BackupRecord.DoesNotExist:
        return Response({"error": "Backup not found"}, status=404)

    path = _backup_path(record.filename)
    if not default_storage.exists(path):
        return Response({"error": "Backup file missing on server"}, status=404)

    with default_storage.open(path, "rb") as f:
        content = f.read()

    from django.http import HttpResponse
    response = HttpResponse(content, content_type="application/json")
    response["Content-Disposition"] = f'attachment; filename="{record.filename}"'
    return response


def _restore_from_content(content_bytes):
    """Wipe all api-app data (except BackupRecord) and reload it from a dumpdata JSON payload."""
    tmp_path = _backup_path(f"_restore_tmp_{datetime.now().strftime('%Y%m%d_%H%M%S%f')}.json")
    saved_name = default_storage.save(tmp_path, io.BytesIO(content_bytes))
    full_path = default_storage.path(saved_name) if hasattr(default_storage, "path") else saved_name

    api_models = [m for m in apps.get_app_config("api").get_models() if m is not BackupRecord]

    with connection.cursor() as cursor:
        cursor.execute("PRAGMA foreign_keys = OFF;")
    try:
        with transaction.atomic():
            for model in api_models:
                model.objects.all().delete()
            management.call_command("loaddata", full_path)
    finally:
        with connection.cursor() as cursor:
            cursor.execute("PRAGMA foreign_keys = ON;")
        if default_storage.exists(saved_name):
            default_storage.delete(saved_name)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def system_backup_restore(request, backup_id):
    try:
        record = BackupRecord.objects.get(id=backup_id)
    except BackupRecord.DoesNotExist:
        return Response({"error": "Backup not found"}, status=404)

    path = _backup_path(record.filename)
    if not default_storage.exists(path):
        return Response({"error": "Backup file missing on server"}, status=404)

    with default_storage.open(path, "rb") as f:
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
@permission_classes([IsAuthenticated])
def system_backup_restore_upload(request):
    file_obj = request.FILES.get("file")
    if not file_obj:
        return Response({"error": "No file provided"}, status=400)

    content = file_obj.read()
    try:
        import json
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
