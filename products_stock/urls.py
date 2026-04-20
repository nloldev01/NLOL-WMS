from rest_framework.routers import DefaultRouter
from .views import ProductStockViewSet, ProductStockLogViewSet

router = DefaultRouter()
router.include_format_suffixes = False
router.register(r'stock',           ProductStockViewSet,    basename='product-stock')
router.register(r'stock-movements', ProductStockLogViewSet, basename='product-stock-log')

urlpatterns = router.urls