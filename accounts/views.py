from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from django.utils import timezone

from .models import User


@api_view(['POST'])
def login_view(request):
    login_input = request.data.get('username')
    password = request.data.get('password')

    if not login_input or not password:
        return Response(
            {'error': 'Username/Email and password are required'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        try:
            user = User.objects.get(username=login_input)
        except User.DoesNotExist:
            try:
                user = User.objects.get(email=login_input)
            except User.DoesNotExist:
                return Response(
                    {'error': 'Invalid username/email or password'},
                    status=status.HTTP_401_UNAUTHORIZED
                )
    except User.MultipleObjectsReturned:
        return Response(
            {'error': 'Multiple users found with this identifier'},
            status=status.HTTP_400_BAD_REQUEST
        )

    if not user.check_password(password):
        return Response(
            {'error': 'Invalid username/email or password'},
            status=status.HTTP_401_UNAUTHORIZED
        )

    if user.status != User.STATUS_ACTIVE:
        return Response(
            {'error': 'Account is not active'},
            status=status.HTTP_403_FORBIDDEN
        )

    user.last_login_date = timezone.now()
    user.save(update_fields=['last_login_date'])

    refresh = RefreshToken.for_user(user)

    return Response({
        'message': 'Login successful',
        'access': str(refresh.access_token),
        'refresh': str(refresh),
        'user': {
            'id': user.id,
            'username': user.username,
            'fullname': user.fullname,
            'email': user.email,
            'role': user.user_role.role,
            'status': user.status,
        }
    }, status=status.HTTP_200_OK)