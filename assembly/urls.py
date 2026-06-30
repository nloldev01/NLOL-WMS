from rest_framework.routers import DefaultRouter
from .views import VariantPackagingMaterialViewSet, AssemblyOrderViewSet

router = DefaultRouter()
router.register('bom',             VariantPackagingMaterialViewSet,  basename='bom')
router.register('assembly-orders', AssemblyOrderViewSet,             basename='assembly-orders')

urlpatterns = router.urls
