from rest_framework.routers import SimpleRouter
from .views import ConsumableRequestViewSet

router = SimpleRouter()
router.register(r'requests', ConsumableRequestViewSet, basename='consumable-request')

urlpatterns = router.urls
