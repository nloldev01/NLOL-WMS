import logging

security_logger = logging.getLogger('erp.security')
error_logger = logging.getLogger('erp.error')

def get_client_ip(request):
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip

class LoggingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)

        # Log security events (401 Unauthorized, 403 Forbidden)
        if response.status_code in [401, 403]:
            ip = get_client_ip(request)
            user = request.user.username if hasattr(request, 'user') and request.user.is_authenticated else 'Anonymous'
            path = request.path
            
            security_logger.warning(
                f"Security Event | Status: {response.status_code} | User: {user} | IP: {ip} | Path: {path}"
            )
            
        # Log server errors (500 Internal Server Error)
        elif response.status_code >= 500:
            ip = get_client_ip(request)
            user = request.user.username if hasattr(request, 'user') and request.user.is_authenticated else 'Anonymous'
            path = request.path
            
            error_logger.error(
                f"Server Error | Status: {response.status_code} | User: {user} | IP: {ip} | Path: {path}"
            )

        return response
