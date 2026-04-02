from django.urls import path
from .views import user_list, user_detail, role_list, logout_view

urlpatterns = [
    path('users/', user_list),
    path('users/<int:pk>/', user_detail),
    path('roles/', role_list),
    path('logout/', logout_view, name='logout'),
]