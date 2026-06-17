from rest_framework.routers import SimpleRouter
from .views import RefillOrderViewSet

router = SimpleRouter()
router.register(r'refill-orders', RefillOrderViewSet, basename='refill-order')

urlpatterns = router.urls
