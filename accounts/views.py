from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from django.utils import timezone
from django.core.signing import TimestampSigner, SignatureExpired, BadSignature
from django.conf import settings
from django.http import FileResponse, Http404
from django.core.management import call_command

import logging
import os
import threading

from .models import User, BackupJob
from .permissions import get_user_permissions, IsSuperAdmin
from .otp_utils import generate_otp_secret, get_provisioning_uri, verify_otp_code, generate_qr_code_base64

auth_logger = logging.getLogger('erp.auth')
signer = TimestampSigner()

@api_view(['POST'])
@permission_classes([AllowAny])
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
                auth_logger.warning(f"Failed login attempt | User not found: {login_input} | IP: {request.META.get('REMOTE_ADDR')}")
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
        auth_logger.warning(f"Failed login attempt | Incorrect password | User: {user.username} | IP: {request.META.get('REMOTE_ADDR')}")
        return Response(
            {'error': 'Invalid username/email or password'},
            status=status.HTTP_401_UNAUTHORIZED
        )

    if user.status != User.STATUS_ACTIVE:
        auth_logger.warning(f"Failed login attempt | Account inactive | User: {user.username} | IP: {request.META.get('REMOTE_ADDR')}")
        return Response(
            {'error': 'Account is not active'},
            status=status.HTTP_403_FORBIDDEN
        )

    # If 2FA is not enabled for this user, log in directly
    if not user.is_2fa_enabled:
        return login_success_response(user, request)

    # 2FA is enabled — generate a temporary token for the verification step
    temp_token = signer.sign(str(user.id))
    return Response({
        'message': '2FA required',
        'is_2fa_enabled': user.is_2fa_enabled,
        'temp_token': temp_token,
        'username': user.username
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
def setup_2fa_view(request):
    temp_token = request.data.get('temp_token')
    if not temp_token:
        return Response({'error': 'Temporary token required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user_id = signer.unsign(temp_token, max_age=600) # Increased to 10 minutes
        user = User.objects.get(id=user_id)
    except (SignatureExpired, BadSignature, User.DoesNotExist):
        return Response({'error': 'Invalid or expired session. Please login again.'}, status=status.HTTP_401_UNAUTHORIZED)

    if user.is_2fa_enabled:
        return Response({'error': '2FA is already enabled'}, status=status.HTTP_400_BAD_REQUEST)

    # Always ensure a secret exists
    if not user.otp_base32_secret:
        user.otp_base32_secret = generate_otp_secret()
        user.save(update_fields=['otp_base32_secret'])

    uri = get_provisioning_uri(user.email, user.otp_base32_secret)
    qr_code = generate_qr_code_base64(uri)

    return Response({
        'secret': user.otp_base32_secret,
        'qr_code': qr_code,
        'provisioning_uri': uri
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_2fa_setup_view(request):
    temp_token = request.data.get('temp_token')
    code = request.data.get('code', '').strip()

    if not temp_token or not code:
        return Response({'error': 'Token and code are required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user_id = signer.unsign(temp_token, max_age=600)
        user = User.objects.get(id=user_id)
    except (SignatureExpired, BadSignature, User.DoesNotExist):
        return Response({'error': 'Invalid or expired session'}, status=status.HTTP_401_UNAUTHORIZED)

    if verify_otp_code(user.otp_base32_secret, code):
        user.is_2fa_enabled = True
        user.save(update_fields=['is_2fa_enabled'])
        auth_logger.info(f"2FA Setup successful | User: {user.username} | IP: {request.META.get('REMOTE_ADDR')}")
        return login_success_response(user, request)
    else:
        auth_logger.warning(f"Failed 2FA setup attempt | Invalid code | User: {user.username} | IP: {request.META.get('REMOTE_ADDR')}")
        return Response({'error': 'Invalid verification code. Please check your app.'}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_2fa_login_view(request):
    temp_token = request.data.get('temp_token')
    code = request.data.get('code', '').strip()

    if not temp_token or not code:
        return Response({'error': 'Token and code are required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user_id = signer.unsign(temp_token, max_age=600)
        user = User.objects.get(id=user_id)
    except (SignatureExpired, BadSignature, User.DoesNotExist):
        return Response({'error': 'Invalid or expired session'}, status=status.HTTP_401_UNAUTHORIZED)

    if not user.is_2fa_enabled:
         return Response({'error': '2FA is not set up for this account'}, status=status.HTTP_400_BAD_REQUEST)

    if verify_otp_code(user.otp_base32_secret, code):
        return login_success_response(user, request)
    else:
        auth_logger.warning(f"Failed 2FA login attempt | Invalid code | User: {user.username} | IP: {request.META.get('REMOTE_ADDR')}")
        return Response({'error': 'Invalid verification code'}, status=status.HTTP_400_BAD_REQUEST)


def login_success_response(user, request=None):
    user.last_login_date = timezone.now()
    user.save(update_fields=['last_login_date'])

    ip = request.META.get('REMOTE_ADDR') if request else 'Unknown'
    auth_logger.info(f"Successful login | User: {user.username} | IP: {ip}")

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
            'permissions': get_user_permissions(user),
        }
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password_view(request):
    old_password = request.data.get('old_password')
    new_password = request.data.get('new_password')

    if not old_password or not new_password:
        return Response({'error': 'Old and new passwords are required'}, status=status.HTTP_400_BAD_REQUEST)

    user = request.user

    if not user.check_password(old_password):
        auth_logger.warning(f"Failed password change attempt | Incorrect old password | User: {user.username} | IP: {request.META.get('REMOTE_ADDR')}")
        return Response({'error': 'Incorrect old password'}, status=status.HTTP_400_BAD_REQUEST)

    user.set_password(new_password)
    user.save()
    
    auth_logger.info(f"Password changed successfully | User: {user.username} | IP: {request.META.get('REMOTE_ADDR')}")

    return Response({'message': 'Password changed successfully'}, status=status.HTTP_200_OK)


def _serialize_backup_job(job):
    return {
        'id':            job.pk,
        'trigger':       job.trigger,
        'status':        job.status,
        'file_name':     job.file_name,
        'file_size':     job.file_size,
        'triggered_by':  job.triggered_by.username if job.triggered_by else None,
        'started_at':    job.started_at,
        'completed_at':  job.completed_at,
        'error_message': job.error_message,
    }


@api_view(['POST'])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def run_backup(request):
    job = BackupJob.objects.create(trigger='manual', status='running', triggered_by=request.user)

    def _run():
        call_command('backup_database', trigger='manual', user_id=request.user.id, job_id=job.id)

    threading.Thread(target=_run, daemon=True).start()
    return Response(_serialize_backup_job(job), status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def backup_list(request):
    jobs = BackupJob.objects.select_related('triggered_by').all()[:100]
    return Response([_serialize_backup_job(j) for j in jobs])


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def backup_detail(request, pk):
    try:
        job = BackupJob.objects.select_related('triggered_by').get(pk=pk)
    except BackupJob.DoesNotExist:
        raise Http404
    return Response(_serialize_backup_job(job))


@api_view(['GET'])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def download_backup(request, pk):
    try:
        job = BackupJob.objects.get(pk=pk)
    except BackupJob.DoesNotExist:
        raise Http404

    if job.status != 'success' or not job.file_name:
        return Response({'error': 'This backup is not available for download.'}, status=status.HTTP_400_BAD_REQUEST)

    file_path = os.path.join(settings.BACKUP_DIR, job.file_name)
    if not os.path.exists(file_path):
        return Response({'error': 'Backup file is missing on disk.'}, status=status.HTTP_404_NOT_FOUND)

    return FileResponse(open(file_path, 'rb'), as_attachment=True, filename=job.file_name)


@api_view(['DELETE'])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def delete_backup(request, pk):
    try:
        job = BackupJob.objects.get(pk=pk)
    except BackupJob.DoesNotExist:
        raise Http404

    if job.file_name:
        file_path = os.path.join(settings.BACKUP_DIR, job.file_name)
        if os.path.exists(file_path):
            os.remove(file_path)

    job.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)