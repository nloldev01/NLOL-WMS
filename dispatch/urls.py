from rest_framework.routers import SimpleRouter
from .views import (
    DealerOrderViewSet,
    DispatchOrderViewSet,
    DealerStockViewSet,
    DealerSaleViewSet,
)

router = SimpleRouter()
router.register(r'dealer-orders',   DealerOrderViewSet,   basename='dealer-order')
router.register(r'dispatch-orders', DispatchOrderViewSet, basename='dispatch-order')
router.register(r'dealer-stock',    DealerStockViewSet,   basename='dealer-stock')
router.register(r'dealer-sales',    DealerSaleViewSet,    basename='dealer-sale')

urlpatterns = router.urls
