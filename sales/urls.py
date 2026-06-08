from django.urls import path
from rest_framework.routers import DefaultRouter
from .views import CustomerViewSet, InvoiceViewSet, InvoiceItemViewSet, dashboard_stats

router = DefaultRouter()
router.include_format_suffixes = False
router.register(r'customers', CustomerViewSet, basename='customer')
router.register(r'invoices', InvoiceViewSet, basename='invoice')
router.register(r'invoice-items', InvoiceItemViewSet, basename='invoice-item')

urlpatterns = router.urls + [
    path('dashboard-stats/', dashboard_stats),
]
