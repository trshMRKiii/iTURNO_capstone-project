"""PhilSMS (philsms.com) SMS client.

Called from TicketSerializer.create() (see api/serializers.py) to send the
queue-position alert the moment a vehicle checks into the queue, and from
the dispatch_ticket action (api/views/viewsets.py) to send the next-up alert
to whoever becomes #1 once the vehicle ahead is dispatched.

On/off switch lives in backend/.env (SMS_ENABLED), same pattern as DEBUG
in settings.py. While it's off, send_sms() just logs and returns None
instead of calling the PhilSMS API.
"""
import json
import logging
import urllib.error
import urllib.request

from django.conf import settings

logger = logging.getLogger('sms')


class SmsError(Exception):
    """Raised when SMS_ENABLED=True but the PhilSMS API call fails."""


def normalize_ph_number(number):
    """Convert a local PH mobile number (09XXXXXXXXX) to PhilSMS's expected
    international format (639XXXXXXXXX). Leaves already-international or
    other-format numbers untouched."""
    digits = ''.join(ch for ch in str(number) if ch.isdigit())
    if digits.startswith('0') and len(digits) == 11:
        return '63' + digits[1:]
    return digits


def send_sms(number, message):
    """Send one SMS via the PhilSMS API. Returns the parsed JSON response,
    or None when SMS_ENABLED=False (the no-op/off state)."""
    if not settings.SMS_ENABLED:
        logger.info('SMS skipped (SMS_ENABLED=False): %s -> %r', number, message)
        return None

    if not settings.PHILSMS_API_TOKEN:
        raise SmsError('PHILSMS_API_TOKEN is not set in backend/.env')

    payload = {
        'recipient': normalize_ph_number(number),
        'sender_id': settings.PHILSMS_SENDER_ID,
        'type': 'plain',
        'message': message,
    }

    request = urllib.request.Request(
        settings.PHILSMS_API_URL,
        data=json.dumps(payload).encode(),
        method='POST',
        headers={
            'Authorization': f'Bearer {settings.PHILSMS_API_TOKEN}',
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            # Cloudflare in front of app.philsms.com blocks the default
            # urllib user-agent outright (error 1010), so pretend to be a browser.
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                          '(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            body = json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors='replace')
        logger.error('SMS to %s failed: %s %s', number, exc, detail)
        raise SmsError(detail or str(exc)) from exc
    except urllib.error.URLError as exc:
        logger.error('SMS to %s failed: %s', number, exc)
        raise SmsError(str(exc)) from exc

    if body.get('status') == 'error':
        logger.error('SMS to %s failed: %s', number, body.get('message'))
        raise SmsError(body.get('message', 'Unknown PhilSMS error'))

    logger.info('SMS sent to %s', number)
    return body
