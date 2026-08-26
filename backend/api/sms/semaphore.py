"""Semaphore (semaphore.co) SMS client.

Environment-only for now: send_sms() is ready to call but nothing in the
app calls it yet — the queue-position trigger logic (5th-in-line +
next-up-on-dispatch, see dispatch.jsx) still needs to be built on top of it.

On/off switch lives in backend/.env (SMS_ENABLED), same pattern as DEBUG
in settings.py. While it's off, send_sms() just logs and returns None
instead of calling the Semaphore API.
"""
import json
import logging
import urllib.error
import urllib.parse
import urllib.request

from django.conf import settings

logger = logging.getLogger('sms')


class SmsError(Exception):
    """Raised when SMS_ENABLED=True but the Semaphore API call fails."""


def send_sms(number, message):
    """Send one SMS via the Semaphore API. Returns the parsed JSON response,
    or None when SMS_ENABLED=False (the no-op/off state)."""
    if not settings.SMS_ENABLED:
        logger.info('SMS skipped (SMS_ENABLED=False): %s -> %r', number, message)
        return None

    if not settings.SEMAPHORE_API_KEY:
        raise SmsError('SEMAPHORE_API_KEY is not set in backend/.env')

    payload = {
        'apikey': settings.SEMAPHORE_API_KEY,
        'number': number,
        'message': message,
    }
    if settings.SEMAPHORE_SENDER_NAME:
        payload['sendername'] = settings.SEMAPHORE_SENDER_NAME

    request = urllib.request.Request(
        settings.SEMAPHORE_API_URL,
        data=urllib.parse.urlencode(payload).encode(),
        method='POST',
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            body = json.loads(response.read().decode())
    except urllib.error.URLError as exc:
        logger.error('SMS to %s failed: %s', number, exc)
        raise SmsError(str(exc)) from exc

    logger.info('SMS sent to %s', number)
    return body
