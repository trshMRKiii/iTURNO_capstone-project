import logging
import threading

from .philsms import send_sms, SmsError
from .templates import queue_position_message, queue_next_message

logger = logging.getLogger('sms')


def send_sms_async(number, message):
    """Fire-and-forget send_sms() on a background thread so the request that
    triggered it (check-in, dispatch) doesn't block on PhilSMS's HTTP round
    trip before it can respond."""
    def _send():
        try:
            send_sms(number, message)
        except SmsError:
            logger.exception('Async SMS to %s failed', number)

    threading.Thread(target=_send, daemon=True).start()


__all__ = ['send_sms', 'send_sms_async', 'SmsError', 'queue_position_message', 'queue_next_message']
