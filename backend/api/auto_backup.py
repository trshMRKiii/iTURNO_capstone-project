import logging
import os
import sys
import threading
import time
from datetime import timedelta

from django.utils import timezone

logger = logging.getLogger("sync")

CHECK_EVERY_SECONDS = 300  # settings are re-read each pass, so changes apply within minutes


def _run_once():
    from .models import BackupRecord, BackupSettings
    from .views.system import SCHEDULED_LABEL, _create_backup_file, backup_storage

    config = BackupSettings.get_solo()
    if not config.enabled:
        return

    scheduled = BackupRecord.objects.filter(source="AUTO", label=SCHEDULED_LABEL).order_by("-created_at")
    latest = scheduled.first()
    if not latest or timezone.now() - latest.created_at >= timedelta(days=config.interval_days):
        latest = _create_backup_file(None, label=SCHEDULED_LABEL, source="AUTO")

    # Automatic backups (scheduled and pre-restore) expire; manual ones are never touched.
    expired = BackupRecord.objects.filter(
        source="AUTO", created_at__lt=timezone.now() - timedelta(days=config.keep_days),
    ).exclude(pk=latest.pk)
    for old in expired:
        backup_storage.delete(old.filename)
        old.delete()


def _loop():
    from django.db import close_old_connections

    while True:
        try:
            close_old_connections()
            _run_once()
        except Exception:
            logger.exception("scheduled backup failed")
        time.sleep(CHECK_EVERY_SECONDS)


def start():
    """Start the scheduler inside the dev server process only (not migrate/shell/etc., not the autoreload parent)."""
    if "runserver" not in sys.argv:
        return
    if "--noreload" not in sys.argv and os.environ.get("RUN_MAIN") != "true":
        return
    threading.Thread(target=_loop, name="auto-backup", daemon=True).start()
