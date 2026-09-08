from django.db import transaction
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

from api.models import Ticket, Vehicle

from .broadcast import broadcast_queue_updated


@receiver(post_save, sender=Vehicle)
@receiver(post_delete, sender=Vehicle)
@receiver(post_save, sender=Ticket)
@receiver(post_delete, sender=Ticket)
def notify_queue_changed(sender, **kwargs):
    # The sync engine re-saves these same models into 'supabase' (see
    # api/sync/push.py) — ignore that echo so a background sync cycle
    # doesn't spam LAN clients with a queue-changed broadcast for a row
    # that didn't actually change locally.
    if kwargs.get('using') not in (None, 'default'):
        return
    # Defer until the transaction actually commits — dispatch/backfill
    # actions save several rows inside one atomic() block, and a client
    # that re-fetches the instant it gets a mid-transaction ping can read
    # pre-commit state, leaving it stuck showing a stale queue until some
    # later, unrelated change corrects it.
    transaction.on_commit(broadcast_queue_updated)
