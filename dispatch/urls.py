from rest_framework.routers import SimpleRouter
from .views import (
    DealerOrderViewSet,
    DispatchOrderViewSet,
    DealerStockViewSet,
    DealerSaleViewSet,
    CatalogViewSet,
)

router = SimpleRouter()
router.register(r'dealer-orders',   DealerOrderViewSet,   basename='dealer-order')
router.register(r'dispatch-orders', DispatchOrderViewSet, basename='dispatch-order')
router.register(r'dealer-stock',    DealerStockViewSet,   basename='dealer-stock')
router.register(r'dealer-sales',    DealerSaleViewSet,    basename='dealer-sale')
router.register(r'catalog',         CatalogViewSet,       basename='dispatch-catalog')

urlpatterns = router.urls
