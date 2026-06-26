from rest_framework import viewsets, filters, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from accounts.permissions import ModulePermission
from .models import Unit, FiscalYear, Asset, Location, RawMaterialAndConsumable, ProductGroup, ProductSubGroup, ProductSegment, Product, Parameter, TestDefinition, TestDefinitionParameter, FinishedProduct, FinishedProductVariant, Supplier
from .serializers import UnitSerializer, FiscalYearSerializer, AssetSerializer, LocationSerializer, RawMaterialAndConsumableSerializer, ProductGroupSerializer, ProductSubGroupSerializer, ProductSegmentSerializer, ProductSerializer, ParameterSerializer, TestDefinitionSerializer, TestDefinitionParameterSerializer, FinishedProductSerializer, FinishedProductVariantSerializer, SupplierSerializer


class UnitViewSet(viewsets.ModelViewSet):
    """
    CRUD for Units.
    Supports:  ?search=kg  ?is_active=true
    """
    permission_classes = ModulePermission.read_write('master_data')
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
    permission_classes = ModulePermission.read_write('master_data')
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
    permission_classes = ModulePermission.read_write('master_data')
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
    permission_classes = ModulePermission.read_write('master_data')
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
    permission_classes = ModulePermission.read_write('master_data')
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
    permission_classes = ModulePermission.read_write('master_data')
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
    permission_classes = ModulePermission.read_write('master_data')
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
    permission_classes = ModulePermission.read_write('master_data')
    queryset = ProductSegment.objects.all()
    serializer_class = ProductSegmentSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name']
    ordering_fields = ['name']


class ProductViewSet(viewsets.ModelViewSet):
    permission_classes = ModulePermission.read_write('master_data')
    queryset = Product.objects.select_related('unit').all()
    serializer_class = ProductSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    search_fields = ['name', 'description']
    ordering_fields = ['name', 'is_available']


class ParameterViewSet(viewsets.ModelViewSet):
    """
    Master catalog of lab test characteristics. Admin-governed, rarely edited —
    seeded directly (see production.seed_test_definitions) rather than through
    a dedicated UI. Exposed read/write here only so it can still be corrected
    via the DRF browsable API or Django admin without a code change.
    """
    permission_classes = ModulePermission.read_write('first_fill_test')
    queryset         = Parameter.objects.all()
    serializer_class = ParameterSerializer
    filter_backends  = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['value_type', 'is_active']
    search_fields    = ['code', 'name']


class TestDefinitionViewSet(viewsets.ModelViewSet):
    """
    Report formats (e.g. "Engine Oil COA"). New formats/limits are data
    changes here and on TestDefinitionParameter — never new form code.
    """
    permission_classes = ModulePermission.read_write('first_fill_test')
    queryset         = TestDefinition.objects.prefetch_related('parameters', 'parameters__parameter').all()
    serializer_class = TestDefinitionSerializer
    filter_backends  = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['category', 'is_active']
    search_fields    = ['code', 'name', 'category']


class TestDefinitionParameterViewSet(viewsets.ModelViewSet):
    permission_classes = ModulePermission.read_write('first_fill_test')
    queryset         = TestDefinitionParameter.objects.select_related('test', 'parameter').all()
    serializer_class = TestDefinitionParameterSerializer
    filter_backends  = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['test', 'parameter']
    ordering_fields  = ['sort_order']


class FinishedProductViewSet(viewsets.ModelViewSet):
    permission_classes = ModulePermission.read_write('master_data')
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
    permission_classes = ModulePermission.read_write('master_data')
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
    permission_classes = ModulePermission.read_write('master_data')
    queryset = Supplier.objects.all().order_by('name')
    serializer_class = SupplierSerializer