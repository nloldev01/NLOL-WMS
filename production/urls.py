from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import RecipeViewSet, ProductionOrderViewSet

router = DefaultRouter()
router.include_format_suffixes = False
router.register(r'recipes',       RecipeViewSet,          basename='recipe')
router.register(r'orders',        ProductionOrderViewSet, basename='production-order')

urlpatterns = [
    path('', include(router.urls)),
]
