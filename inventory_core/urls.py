from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import BatchViewSet, LPNViewSet, PalletViewSet, TransferViewSet

router = DefaultRouter()
router.include_format_suffixes = False
router.register(r'batches',       BatchViewSet,       basename='batches')
router.register(r'lpns',          LPNViewSet,         basename='lpns')
router.register(r'pallets',       PalletViewSet,      basename='pallet')
router.register(r'transfers',     TransferViewSet,    basename='transfer')

urlpatterns = [
    path('', include(router.urls)),
]
