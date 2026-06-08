import logging
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from accounts.models import User, UserRole, SystemModule, RoleModulePermission
from .serializers import UserSerializer, UserRoleSerializer

auth_logger = logging.getLogger('erp.auth')


def is_superadmin(user):
    """Check if user has superadmin role"""
    return user.is_authenticated and user.user_role.role == 'superadmin'


@api_view(['GET', 'POST'])
def user_list(request):
    # GET — list all users
    if request.method == 'GET':
        if not request.user.is_authenticated:
            return Response(
                {'error': 'Authentication required'},
                status=status.HTTP_401_UNAUTHORIZED
            )
        users = User.objects.select_related('user_role').all()
        serializer = UserSerializer(users, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    # POST — create new user
    if request.method == 'POST':
        if not is_superadmin(request.user):
            return Response(
                {'error': 'Only superadmin can create users'},
                status=status.HTTP_403_FORBIDDEN
            )
        serializer = UserSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET', 'PUT'])
@permission_classes([IsAuthenticated])
def user_detail(request, pk):
    try:
        user = User.objects.get(pk=pk)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

    # GET — single user
    if request.method == 'GET':
        serializer = UserSerializer(user)
        return Response(serializer.data, status=status.HTTP_200_OK)

    # PUT — update user
    if request.method == 'PUT':
        serializer = UserSerializer(user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def toggle_2fa(request, pk):
    if not is_superadmin(request.user):
        return Response({'error': 'Only superadmin can manage 2FA'}, status=status.HTTP_403_FORBIDDEN)
    try:
        user = User.objects.get(pk=pk)
    except User.DoesNotExist:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

    if user.is_2fa_enabled:
        user.is_2fa_enabled = False
        user.otp_base32_secret = None
        user.save(update_fields=['is_2fa_enabled', 'otp_base32_secret'])
        return Response({'is_2fa_enabled': False, 'message': '2FA disabled'})
    else:
        user.is_2fa_enabled = True
        user.save(update_fields=['is_2fa_enabled'])
        return Response({'is_2fa_enabled': True, 'message': '2FA enabled — user must set up TOTP on next login'})


@api_view(['GET'])
def role_list(request):
    roles = UserRole.objects.all()
    serializer = UserRoleSerializer(roles, many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def system_modules_list(request):
    modules = SystemModule.objects.all()
    data = [{'id': m.id, 'key': m.key, 'label': m.label, 'description': m.description, 'sort_order': m.sort_order} for m in modules]
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def role_permissions_list(request):
    perms = RoleModulePermission.objects.select_related('role', 'module').all()
    data = [{'id': p.id, 'role': p.role_id, 'role_name': p.role.role, 'module_key': p.module.key, 'access': p.access} for p in perms]
    return Response(data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def role_permissions_bulk_update(request):
    if not is_superadmin(request.user):
        return Response({'error': 'Only superadmin can modify permissions'}, status=status.HTTP_403_FORBIDDEN)

    matrix = request.data.get('matrix', {})
    updated = 0
    for role_id_str, module_map in matrix.items():
        try:
            role = UserRole.objects.get(id=int(role_id_str))
        except (UserRole.DoesNotExist, ValueError):
            continue
        for module_key, access in module_map.items():
            if access not in ('none', 'view', 'full'):
                continue
            try:
                module = SystemModule.objects.get(key=module_key)
            except SystemModule.DoesNotExist:
                continue
            RoleModulePermission.objects.update_or_create(role=role, module=module, defaults={'access': access})
            updated += 1

    return Response({'updated': updated})


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def role_permissions_reset_defaults(request):
    if not is_superadmin(request.user):
        return Response({'error': 'Only superadmin can reset permissions'}, status=status.HTTP_403_FORBIDDEN)
    from django.core.management import call_command
    call_command('seed_permissions', reset=True)
    return Response({'message': 'Permissions reset to defaults'})


@api_view(['POST'])
def logout_view(request):
    refresh_token = request.data.get('refresh')

    if not refresh_token:
        return Response(
            {'error': 'Refresh token is required'},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        token = RefreshToken(refresh_token)
        token.blacklist()
        
        user_name = request.user.username if request.user.is_authenticated else 'Unknown'
        ip = request.META.get('REMOTE_ADDR', 'Unknown')
        auth_logger.info(f"Logout successful | User: {user_name} | IP: {ip}")

        return Response(
            {'message': 'Logout successful'},
            status=status.HTTP_200_OK
        )
    except TokenError:
        return Response(
            {'error': 'Invalid or expired token'},
            status=status.HTTP_400_BAD_REQUEST
        )
