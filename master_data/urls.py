from rest_framework.routers import DefaultRouter
from .views import UnitViewSet, FiscalYearViewSet, AssetViewSet, LocationViewSet, RawMaterialAndConsumableViewSet, ProductGroupsViewSet, ProductSubGroupViewSet, ProductSegmentViewSet, ProductViewSet

router = DefaultRouter()
router.register(r'units', UnitViewSet, basename='unit')
router.register(r'fiscal-years', FiscalYearViewSet, basename='fiscal-year')
router.register(r'assets', AssetViewSet, basename='asset')
router.register(r'locations', LocationViewSet, basename='location')
router.register(r'raw-materials-and-consumables', RawMaterialAndConsumableViewSet, basename='raw-material-and-consumable')
router.register(r'product-groups', ProductGroupsViewSet, basename='product-group')
router.register(r'product-sub-groups', ProductSubGroupViewSet, basename='product-sub-group')
router.register(r'product-segments', ProductSegmentViewSet, basename='product-segment')
router.register(r'products', ProductViewSet, basename='product')

urlpatterns = router.urls
