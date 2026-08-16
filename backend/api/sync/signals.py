from django.db.models.signals import post_save, post_delete

from api.models import SyncQueue
from api.sync.registry import PUSH_MODELS


def _enqueue_for_push(sender, instance, using, **kwargs):
    # A save fired by push.py itself (instance.save(using='supabase')) triggers
    # this same signal — without this guard every successful push would
    # immediately re-queue itself, retrying forever despite succeeding.
    if using not in (None, 'default'):
        return
    SyncQueue.objects.update_or_create(
        model_label=instance._meta.label,
        object_id=str(instance.pk),
        defaults={'synced_at': None, 'attempts': 0, 'last_error': '', 'pending_delete': False},
    )


def _enqueue_for_delete(sender, instance, using, **kwargs):
    # Same cross-DB-echo guard as above — push.py's own delete against
    # 'supabase' (once delete propagation runs) must not re-queue itself.
    if using not in (None, 'default'):
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
