from django.urls import path
from .views import (
    user_list, user_detail, role_list, logout_view,
    system_modules_list, role_permissions_list,
    role_permissions_bulk_update, role_permissions_reset_defaults,
    toggle_2fa,
)

urlpatterns = [
    path('users/', user_list),
    path('users/<int:pk>/', user_detail),
    path('users/<int:pk>/toggle-2fa/', toggle_2fa),
    path('roles/', role_list),
    path('logout/', logout_view, name='logout'),
    path('system-modules/', system_modules_list),
    path('role-permissions/', role_permissions_list),
    path('role-permissions/bulk-update/', role_permissions_bulk_update),
    path('role-permissions/reset-defaults/', role_permissions_reset_defaults),
]