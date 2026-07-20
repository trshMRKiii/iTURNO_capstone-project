from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from .consumers import QUEUE_GROUP


def broadcast_queue_updated():
    """Notify connected queue-board clients that they should re-fetch.

    Safe to call from sync code (model signals, views). No-ops if no
    channel layer is configured (e.g. during management commands/tests).
    """
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    async_to_sync(channel_layer.group_send)(QUEUE_GROUP, {'type': 'queue_updated'})
