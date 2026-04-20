from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import BatchViewSet

router = DefaultRouter()
router.include_format_suffixes = False
router.register(r'batches', BatchViewSet, basename='batches')

urlpatterns = [
    path('', include(router.urls)),
]