from rest_framework.routers import DefaultRouter
from .views import UnitViewSet, FiscalYearViewSet, AssetViewSet, LocationViewSet, RawMaterialAndConsumableViewSet

router = DefaultRouter()
router.register(r'units',        UnitViewSet,       basename='unit')
router.register(r'fiscal-years', FiscalYearViewSet, basename='fiscal-year')
router.register(r'assets',       AssetViewSet,      basename='asset')
router.register(r'locations',                     LocationViewSet,                    basename='location')
router.register(r'raw-materials-and-consumables', RawMaterialAndConsumableViewSet,    basename='raw-material-and-consumable')

urlpatterns = router.urls
