import jwt
from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils.crypto import get_random_string

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import User
from ..tokens import (
    sign_password_reset_token, verify_password_reset_token,
    verify_email_verification_token,
)


@api_view(['POST'])
def forgot_password(request):
    email = (request.data.get('email') or '').strip().lower()
    if not email:
        return Response({'detail': 'Email is required.'}, status=status.HTTP_400_BAD_REQUEST)

    # Supabase is the source of truth for User (see api/sync/registry.py) — look up
    # there directly so this sees accounts created/edited remotely without waiting
    # on the next pull cycle.
    user = User.objects.using('supabase').filter(username__iexact=email).first()
    if user:
        # Raw pk, not base64 — has to match the uid format api/remote/auth/[action].js's
        # resetPasswordRemote expects, since this link always opens on Vercel (see
        # settings.PUBLIC_APP_URL) and that's what verifies it.
        uid = str(user.pk)
        token = sign_password_reset_token(user)
        reset_link = f"{settings.PUBLIC_APP_URL}/reset-password?uid={uid}&token={token}"
        user_name = user.first_name or user.username

        text_body = (
            f"Hi {user_name},\n\n"
            "We received a request to reset your password. Click the link below to choose a new one:\n\n"
            f"{reset_link}\n\n"
            "If you didn't request this, you can safely ignore this email."
        )
        html_body = render_to_string('emails/password_reset.html', {
            'user_name': user_name,
            'reset_link': reset_link,
        })

        email = EmailMultiAlternatives(
            subject='Reset your North Central Terminal password',
            body=text_body,
            from_email=settings.DEFAULT_FROM_EMAIL,
            to=[user.username],
        )
        email.attach_alternative(html_body, 'text/html')
        email.send(fail_silently=False)

    # Always respond the same way so we don't reveal whether an email is registered
    return Response({'detail': 'If an account exists for that email, a reset link has been sent.'})


@api_view(['POST'])
def reset_password(request):
    uid = request.data.get('uid')
    token = request.data.get('token')
    new_password = request.data.get('new_password')

    if not uid or not token or not new_password:
        return Response({'detail': 'Missing required fields.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user = User.objects.using('supabase').get(pk=uid)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        return Response({'detail': 'Invalid or expired reset link.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        verify_password_reset_token(token, user)
    except jwt.PyJWTError:
        return Response({'detail': 'Invalid or expired reset link.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        validate_password(new_password, user=user)
    except DjangoValidationError as exc:
        return Response({'detail': ' '.join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)

    user.set_password(new_password)
    user.save(using='supabase')
    return Response({'detail': 'Password has been reset successfully.'})


@api_view(['POST'])
def verify_email(request):
    uid = request.data.get('uid')
    token = request.data.get('token')

    if not uid or not token:
        return Response({'detail': 'Missing required fields.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user = User.objects.using('supabase').get(pk=uid)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        return Response({'detail': 'Invalid or expired verification link.'}, status=status.HTTP_400_BAD_REQUEST)

    if user.email_verified:
        return Response({'detail': 'This account is already verified.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        verify_email_verification_token(token, user)
    except jwt.PyJWTError:
        return Response({'detail': 'Invalid or expired verification link.'}, status=status.HTTP_400_BAD_REQUEST)

    from .viewsets import send_new_account_email

    raw_password = get_random_string(12)
    user.email_verified = True
    user.set_password(raw_password)
    user.save(using='supabase')
    send_new_account_email(user, raw_password)
    return Response({'detail': 'Email verified. Check your inbox for your temporary password.'})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password(request):
    new_password = request.data.get('new_password')
    if not new_password:
        return Response({'detail': 'New password is required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        validate_password(new_password, user=request.user)
    except DjangoValidationError as exc:
        return Response({'detail': ' '.join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)

    # Supabase is the source of truth for User (see forgot_password above).
    # request.user comes from JWTAuthentication's default lookup, which reads
    # the local sync mirror, not supabase — saving that instance directly
    # would silently strand the change there until the next pull cycle,
    # while the Staff Registry (which reads straight from supabase) keeps
    # showing the account as still needing a password change.
    user = User.objects.using('supabase').get(pk=request.user.pk)
    user.set_password(new_password)
    user.must_reset_password = False
    user.save(using='supabase')
    return Response({'detail': 'Password changed successfully.'})
