from rest_framework.routers import DefaultRouter
from .views import VariantPackagingMaterialViewSet, AssemblyMaterialLineViewSet, AssemblyOrderViewSet

router = DefaultRouter()
router.register('bom',             VariantPackagingMaterialViewSet,  basename='bom')
router.register('material-lines',  AssemblyMaterialLineViewSet,      basename='material-lines')
router.register('assembly-orders', AssemblyOrderViewSet,             basename='assembly-orders')

urlpatterns = router.urls
