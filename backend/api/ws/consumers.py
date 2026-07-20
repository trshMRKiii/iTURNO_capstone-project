from channels.generic.websocket import AsyncJsonWebsocketConsumer

QUEUE_GROUP = 'queue_updates'


class QueueConsumer(AsyncJsonWebsocketConsumer):
    """Broadcasts a lightweight "something changed" ping to the public
    queue board. Clients react by re-fetching via the existing REST
    endpoints rather than the server pushing serialized data, so the
    consumer stays free of business/serialization logic.
    """

    async def connect(self):
        await self.channel_layer.group_add(QUEUE_GROUP, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(QUEUE_GROUP, self.channel_name)

    async def queue_updated(self, event):
        await self.send_json({'type': 'queue_updated'})
