import contextlib

from django.db.models.signals import post_save, post_delete

from api.models import SyncQueue
from api.sync.registry import PUSH_MODELS

_bulk_load = False


@contextlib.contextmanager
def bulk_load():
    """Mute per-row side effects (sync enqueue, queue broadcast) during a restore.

    A restore wipes and reloads tens of thousands of rows inside one write
    transaction; firing these handlers per row made it run for minutes while
    holding SQLite's write lock, so every other writer hit "database is locked".
    The caller is responsible for re-queueing/broadcasting once at the end.
    """
    global _bulk_load
    _bulk_load = True
    try:
        yield
    finally:
        _bulk_load = False


def is_bulk_loading():
    return _bulk_load


def _enqueue_for_push(sender, instance, using, **kwargs):
    # A save fired by push.py itself (instance.save(using='supabase')) triggers
    # this same signal — without this guard every successful push would
    # immediately re-queue itself, retrying forever despite succeeding.
    if using not in (None, 'default') or _bulk_load:
        return
    SyncQueue.objects.update_or_create(
        model_label=instance._meta.label,
        object_id=str(instance.pk),
        defaults={'synced_at': None, 'attempts': 0, 'last_error': '', 'pending_delete': False},
    )


def _enqueue_for_delete(sender, instance, using, **kwargs):
    # Same cross-DB-echo guard as above — push.py's own delete against
    # 'supabase' (once delete propagation runs) must not re-queue itself.
    if using not in (None, 'default') or _bulk_load:
        return
    SyncQueue.objects.update_or_create(
        model_label=instance._meta.label,
        object_id=str(instance.pk),
        defaults={'synced_at': None, 'attempts': 0, 'last_error': '', 'pending_delete': True},
    )


def connect():
    for model in PUSH_MODELS:
        post_save.connect(_enqueue_for_push, sender=model, weak=False)
        post_delete.connect(_enqueue_for_delete, sender=model, weak=False)
