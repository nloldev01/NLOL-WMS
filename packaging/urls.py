from rest_framework.routers import DefaultRouter
from .views import PackagingOrderViewSet

router = DefaultRouter()
router.include_format_suffixes = False
router.register(r'packaging-orders', PackagingOrderViewSet, basename='packaging-order')

urlpatterns = router.urls
