import logging

from django.apps import apps
from django.conf import settings
from django.db import transaction
from django.utils import timezone

from api.models import SyncQueue

logger = logging.getLogger('sync')


def _push_delete(row, model):
    with transaction.atomic(using='supabase'):
        model.objects.using('supabase').filter(pk=row.object_id).delete()
    # Nothing left to track once the delete has landed — unlike a synced
    # upsert, there's no local row to compare against anymore, so the queue
    # entry itself is the only thing left to clean up.
    row.delete(using='default')
    return True


def _push_upsert(row, model):
    try:
        instance = model.objects.using('default').get(pk=row.object_id)
    except model.DoesNotExist:
        # Fell out of sync with reality (e.g. deleted via something that
        # bypassed the ORM's delete signal) — nothing to push, stop retrying.
        row.synced_at = timezone.now()
        row.last_error = 'skipped: no longer exists locally'
        row.save(using='default', update_fields=['synced_at', 'last_error'])
        return False

    with transaction.atomic(using='supabase'):
        instance.save(using='supabase')
    row.synced_at = timezone.now()
    row.last_error = ''
    row.save(using='default', update_fields=['synced_at', 'last_error'])
    return True


def push_pending(batch_size=None):
    """Drain SyncQueue: upsert saved rows, delete removed ones, against 'supabase'.

    A failed row is left unsynced (attempts/last_error recorded) and simply
    reappears in next cycle's query — that's the entire retry mechanism.
    FK-dependency ordering (e.g. a Ticket referencing a Vehicle that hasn't
    synced yet) self-heals the same way: the dependency fails first, the
    dependent keeps retrying until it succeeds. Deletes self-heal the same
    way in reverse — Postgres's own ON DELETE behavior (mirroring each
    model's on_delete) cleans up any dependents once the row they point to
    is actually gone.
    """
    if settings.DEBUG:
        logger.info('push skipped: DEBUG=True (test-run data never reaches the shared Supabase mirror)')
        return 0, 0

    batch_size = batch_size or settings.SYNC_BATCH_SIZE
    rows = list(
        SyncQueue.objects.filter(synced_at__isnull=True).order_by('queued_at')[:batch_size]
    )
    pushed, failed = 0, 0

    for row in rows:
        model = apps.get_model(row.model_label)
        try:
            counted = _push_delete(row, model) if row.pending_delete else _push_upsert(row, model)
        except Exception as exc:
            row.attempts += 1
            row.last_error = str(exc)[:500]
            row.save(using='default', update_fields=['attempts', 'last_error'])
            failed += 1
            action = 'delete' if row.pending_delete else 'push'
            logger.warning('%s failed for %s#%s: %s', action, row.model_label, row.object_id, row.last_error)
            continue
        if counted:
            pushed += 1

    logger.info('push cycle: %s pushed, %s failed, %s remaining', pushed, failed,
                SyncQueue.objects.filter(synced_at__isnull=True).count())
    return pushed, failed
