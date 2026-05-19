from django.urls import path
from . import views

urlpatterns = [
    path('login/', views.login_view, name='login'),
    path('setup-2fa/', views.setup_2fa_view, name='setup-2fa'),
    path('verify-2fa-setup/', views.verify_2fa_setup_view, name='verify-2fa-setup'),
    path('verify-2fa-login/', views.verify_2fa_login_view, name='verify-2fa-login'),
    path('change-password/', views.change_password_view, name='change-password'),
]