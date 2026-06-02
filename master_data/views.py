from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from .models import Unit, FiscalYear, Asset, Location, RawMaterialAndConsumable, ProductGroup, ProductSubGroup, ProductSegment, Product, FinishedProduct, FinishedProductVariant, Supplier
from .serializers import UnitSerializer, FiscalYearSerializer, AssetSerializer, LocationSerializer, RawMaterialAndConsumableSerializer, ProductGroupSerializer, ProductSubGroupSerializer, ProductSegmentSerializer, ProductSerializer, FinishedProductSerializer, FinishedProductVariantSerializer, SupplierSerializer


class UnitViewSet(viewsets.ModelViewSet):
    """
    CRUD for Units.
    Supports:  ?search=kg  ?is_active=true
    """
    queryset         = Unit.objects.all()
    serializer_class = UnitSerializer
    filter_backends  = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active', 'unit_type']
    search_fields    = ['name', 'code', 'symbol']
    ordering_fields  = ['name', 'code', 'created_at']

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        name = instance.name  # grab name before deleting
        self.perform_destroy(instance)
        return Response(
            {"message": f"Unit '{name}' deleted successfully"},
            status=status.HTTP_200_OK
        )


class FiscalYearViewSet(viewsets.ModelViewSet):
    """
    CRUD for Fiscal Years.
    Supports:  ?is_active=true

    POST /fiscal-years/{id}/set_active/
        → marks this fiscal year as active and deactivates all others
    """
    queryset         = FiscalYear.objects.all()
    serializer_class = FiscalYearSerializer
    filter_backends  = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_active']
    search_fields    = ['name']
    ordering_fields  = ['name', 'start_date']

    @action(detail=True, methods=['post'], url_path='set_active')
    def set_active(self, request, pk=None):
        """Mark this fiscal year as the active one."""
        fiscal_year = self.get_object()
        FiscalYear.objects.all().update(is_active=False)
        fiscal_year.is_active = True
        fiscal_year.save()
        return Response(
            FiscalYearSerializer(fiscal_year).data,
            status=status.HTTP_200_OK
        )

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        name = instance.name
        self.perform_destroy(instance)
        return Response(
            {"message": f"Fiscal Year '{name}' deleted successfully"},
            status=status.HTTP_200_OK
        )


class AssetViewSet(viewsets.ModelViewSet):
    """
    CRUD for Assets.
    Includes nested asset parameters via the serializer.
    """
    queryset         = Asset.objects.prefetch_related('parameters').all()
    serializer_class = AssetSerializer
    filter_backends  = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'asset_type']
    search_fields    = ['name', 'asset_type']
    ordering_fields  = ['name', 'status']

class LocationViewSet(viewsets.ModelViewSet):
    """
    CRUD for Locations.
    Supports: ?type=zone ?is_active=true ?search=stockyard
    """
    queryset         = Location.objects.select_related('parent').all()
    serializer_class = LocationSerializer
    filter_backends  = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['type', 'is_active', 'parent', 'parent__name']
    search_fields    = ['name', 'short_code']
    ordering_fields  = ['name', 'short_code', 'type']

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        name = instance.name
        self.perform_destroy(instance)
        return Response(
            {"message": f"Location '{name}' deleted successfully"},
            status=status.HTTP_200_OK
        )


class RawMaterialAndConsumableViewSet(viewsets.ModelViewSet):
    """
    CRUD for Raw Materials & Consumables.
    Supports:  ?type=raw_material  ?search=cement
    """
    queryset         = RawMaterialAndConsumable.objects.select_related('unit').all()
    serializer_class = RawMaterialAndConsumableSerializer
    filter_backends  = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['type']
    search_fields    = ['name']
    ordering_fields  = ['name', 'type']

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        name = instance.name
        self.perform_destroy(instance)
        return Response(
            {"message": f"'{name}' deleted successfully"},
            status=status.HTTP_200_OK
        )


class ProductGroupsViewSet(viewsets.ModelViewSet):
    """
    CRUD for Product Groups.
    Supports: ?search=group_name
    """
    queryset = ProductGroup.objects.all()
    serializer_class = ProductGroupSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['name']

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        name = instance.name
        self.perform_destroy(instance)
        return Response(
            {"message": f"Product Group '{name}' deleted successfully"},
            status=status.HTTP_200_OK
        )


class ProductSubGroupViewSet(viewsets.ModelViewSet):
    """
    CRUD for Product Sub-Groups.
    Supports: ?search=sub_group_name
    """
    queryset = ProductSubGroup.objects.all()
    serializer_class = ProductSubGroupSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['name']


class ProductSegmentViewSet(viewsets.ModelViewSet):
    """
    CRUD for Product Segments.
    Supports: ?search=segment_name
    """
    queryset = ProductSegment.objects.all()
    serializer_class = ProductSegmentSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['name']


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.select_related('unit').all()
    serializer_class = ProductSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'is_available']


class FinishedProductViewSet(viewsets.ModelViewSet):
    queryset = FinishedProduct.objects.select_related(
        'base_product', 'base_product__unit',
        'product_group', 'product_segment', 'product_sub_group',
    ).prefetch_related('variants').all()
    serializer_class = FinishedProductSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['is_available', 'base_product']
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'is_available']


class FinishedProductVariantViewSet(viewsets.ModelViewSet):
    queryset = FinishedProductVariant.objects.select_related(
        'finished_product', 'finished_product__base_product', 'finished_product__base_product__unit',
        'unit', 'volume_unit', 'secondary_unit',
    ).all()
    serializer_class = FinishedProductVariantSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['finished_product', 'is_available', 'unit']
    search_fields = ['finished_product__name', 'sku_code']
    ordering_fields = ['finished_product__name', 'volume', 'is_available']

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        label = str(instance)
        self.perform_destroy(instance)
        return Response({"message": f"Variant '{label}' deleted successfully"}, status=status.HTTP_200_OK)


class SupplierViewSet(viewsets.ModelViewSet):
    queryset = Supplier.objects.all().order_by('name')
    serializer_class = SupplierSerializer