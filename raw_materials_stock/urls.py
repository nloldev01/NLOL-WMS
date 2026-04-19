from rest_framework.routers import DefaultRouter
from .views import LocationViewSet, RawMaterialStockViewSet, RawMaterialStockLogViewSet

router = DefaultRouter()
router.include_format_suffixes = False
router.register(r'locations',       LocationViewSet,            basename='location')
router.register(r'stock',           RawMaterialStockViewSet,    basename='raw-material-stock')
router.register(r'stock-movements', RawMaterialStockLogViewSet, basename='raw-material-stock-log')

urlpatterns = router.urls
