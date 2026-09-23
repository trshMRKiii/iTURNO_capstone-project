from datetime import datetime, timedelta, timezone

import jwt
from django.conf import settings

ALGORITHM = 'HS256'


def _secret():
    secret = settings.EMAIL_LINK_SECRET
    if not secret:
        raise RuntimeError('EMAIL_LINK_SECRET is not configured')
    return secret


def sign_password_reset_token(user):
    """Same scheme as Vercel's signPasswordResetToken (api/_lib/auth.js) —
    a JWT signed with the shared EMAIL_LINK_SECRET so either side can verify
    a link the other side issued. Binding the last 12 chars of the current
    password hash means the token stops verifying the moment the password
    actually changes, without needing a DB-side used/unused flag."""
    return jwt.encode(
        {
            'sub': str(user.pk), 'type': 'password-reset', 'pwd': str(user.password)[-12:],
            'exp': datetime.now(timezone.utc) + timedelta(days=3),
        },
        _secret(), algorithm=ALGORITHM,
    )


def verify_password_reset_token(token, user):
    payload = jwt.decode(token, _secret(), algorithms=[ALGORITHM])
    if payload.get('type') != 'password-reset' or payload.get('sub') != str(user.pk):
        raise jwt.InvalidTokenError('Token does not match user')
    if payload.get('pwd') != str(user.password)[-12:]:
        raise jwt.InvalidTokenError('Token already used')
    return payload


def sign_email_verification_token(user):
    """Mirrors signEmailVerificationToken in api/_lib/auth.js. No extra
    binding needed to self-invalidate (unlike the reset token above) —
    verify_email/verifyEmail both reject outright once email_verified is
    already True, before the token is even checked."""
    return jwt.encode(
        {
            'sub': str(user.pk), 'type': 'email-verification',
            'exp': datetime.now(timezone.utc) + timedelta(days=30),
        },
        _secret(), algorithm=ALGORITHM,
    )


def verify_email_verification_token(token, user):
    payload = jwt.decode(token, _secret(), algorithms=[ALGORITHM])
    if payload.get('type') != 'email-verification' or payload.get('sub') != str(user.pk):
        raise jwt.InvalidTokenError('Token does not match user')
    return payload
