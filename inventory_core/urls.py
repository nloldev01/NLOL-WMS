from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import BatchViewSet, LPNViewSet

router = DefaultRouter()
router.include_format_suffixes = False
router.register(r'batches',       BatchViewSet,       basename='batches')
router.register(r'lpns',          LPNViewSet,         basename='lpns')

urlpatterns = [
    path('', include(router.urls)),
]
