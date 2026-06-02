from rest_framework.routers import DefaultRouter
from .views import ProductStockViewSet, ProductStockLogViewSet, FinishedProductStockViewSet, FinishedProductStockLogViewSet

router = DefaultRouter()
router.include_format_suffixes = False
router.register(r'stock',                            ProductStockViewSet,         basename='product-stock')
router.register(r'stock-movements',                  ProductStockLogViewSet,      basename='product-stock-log')
router.register(r'finished-product-stock',           FinishedProductStockViewSet, basename='finished-product-stock')
router.register(r'finished-product-stock-movements', FinishedProductStockLogViewSet, basename='finished-product-stock-log')

urlpatterns = router.urls