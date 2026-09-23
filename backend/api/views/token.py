from rest_framework_simplejwt.exceptions import AuthenticationFailed
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.views import TokenObtainPairView


class VerifiedTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Blocks login for admin-added staff accounts that haven't clicked their
    verification email link yet — is_active stays True for these (it means
    something else: whether the staff member is currently enrolled), so the
    gate has to live here instead."""

    def validate(self, attrs):
        data = super().validate(attrs)
        if not self.user.email_verified:
            raise AuthenticationFailed(
                'Please verify your email before signing in. Check your inbox for the verification link.',
                'email_not_verified',
            )
        return data


class VerifiedTokenObtainPairView(TokenObtainPairView):
    serializer_class = VerifiedTokenObtainPairSerializer
