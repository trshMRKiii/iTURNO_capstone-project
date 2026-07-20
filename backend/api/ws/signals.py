from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver

from api.models import Ticket, Vehicle

from .broadcast import broadcast_queue_updated


@receiver(post_save, sender=Vehicle)
@receiver(post_delete, sender=Vehicle)
@receiver(post_save, sender=Ticket)
@receiver(post_delete, sender=Ticket)
def notify_queue_changed(sender, **kwargs):
    broadcast_queue_updated()
