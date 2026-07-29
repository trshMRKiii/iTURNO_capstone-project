from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from ..models import User


@api_view(['POST'])
def forgot_password(request):
    email = (request.data.get('email') or '').strip().lower()
    if not email:
        return Response({'detail': 'Email is required.'}, status=status.HTTP_400_BAD_REQUEST)

    user = User.objects.filter(username__iexact=email).first()
    if user:
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = PasswordResetTokenGenerator().make_token(user)
        reset_link = f"{settings.FRONTEND_URL}/reset-password?uid={uid}&token={token}"
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
            subject='Reset your iTURNO password',
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
        user_id = force_str(urlsafe_base64_decode(uid))
        user = User.objects.get(pk=user_id)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        return Response({'detail': 'Invalid or expired reset link.'}, status=status.HTTP_400_BAD_REQUEST)

    if not PasswordResetTokenGenerator().check_token(user, token):
        return Response({'detail': 'Invalid or expired reset link.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        validate_password(new_password, user=user)
    except DjangoValidationError as exc:
        return Response({'detail': ' '.join(exc.messages)}, status=status.HTTP_400_BAD_REQUEST)

    user.set_password(new_password)
    user.save()
    return Response({'detail': 'Password has been reset successfully.'})


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

    request.user.set_password(new_password)
    request.user.must_reset_password = False
    request.user.save()
    return Response({'detail': 'Password changed successfully.'})
