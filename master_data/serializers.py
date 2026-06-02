from rest_framework import serializers
from .models import Unit, FiscalYear, Location, RawMaterialAndConsumable, Asset, AssetParameter, ProductGroup, ProductSubGroup, ProductSegment, Product, FinishedProduct, FinishedProductVariant, Supplier


# ── Unit ──────────────────────────────────────────────────────────────────────

class UnitSerializer(serializers.ModelSerializer):
    base_unit_symbol = serializers.ReadOnlyField(source='base_unit.symbol')
    base_unit_name   = serializers.ReadOnlyField(source='base_unit.name')

    class Meta:
        model  = Unit
        fields = ['id', 'name', 'code', 'symbol', 'unit_type', 'icon', 'base_unit', 'base_unit_symbol', 'base_unit_name', 'description', 'is_active']
        read_only_fields = ['id', 'base_unit_symbol', 'base_unit_name']

    def validate_code(self, value):
        return value.upper().strip()

    def validate_name(self, value):
        return value.strip()


# ── Fiscal Year ───────────────────────────────────────────────────────────────

class FiscalYearSerializer(serializers.ModelSerializer):
    class Meta:
        model  = FiscalYear
        fields = ['id', 'name', 'start_date', 'end_date', 'is_active', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']

    def validate(self, data):
        start = data.get('start_date', getattr(self.instance, 'start_date', None))
        end   = data.get('end_date',   getattr(self.instance, 'end_date',   None))
        if start and end and start >= end:
            raise serializers.ValidationError("end_date must be after start_date.")
        return data


# ── Location ──────────────────────────────────────────────────────────────────

class LocationSerializer(serializers.ModelSerializer):
    full_code = serializers.SerializerMethodField()
    full_path = serializers.SerializerMethodField()
    parent_name = serializers.CharField(source='parent.name', read_only=True)
    parent_type = serializers.CharField(source='parent.type', read_only=True)
    linked_asset_name = serializers.CharField(source='linked_asset.name', read_only=True)
    linked_asset_type = serializers.CharField(source='linked_asset.asset_type', read_only=True)
    linked_asset_status = serializers.CharField(source='linked_asset.status', read_only=True)

    class Meta:
        model  = Location
        fields = [
            'id',
            'name',
            'short_code',
            'code',
            'type',
            'parent',
            'parent_name',
            'parent_type',
            'full_code',
            'full_path',
            'linked_asset',
            'linked_asset_name',
            'linked_asset_type',
            'linked_asset_status',
            'is_active',
            'is_production_area',
        ]

    def get_full_code(self, obj):
        return obj.get_full_code()

    def get_full_path(self, obj):
        return obj.get_full_path()

    def validate_parent(self, value):
        if value and value.type not in Location.PARENT_TYPE_CHOICES:
            raise serializers.ValidationError(
                f"Parent location must be one of {', '.join(Location.PARENT_TYPE_CHOICES)}, "
                f"but '{value.name}' is of type '{value.type}'."
            )
        return value

    def validate(self, data):
        # Prevent circular parent reference
        parent = data.get('parent')
        instance = self.instance
        if parent and instance and parent.id == instance.id:
            raise serializers.ValidationError({"parent": "A location cannot be its own parent."})
        return data
    
# ── Raw Materials & Consumables ───────────────────────────────────────────────

class RawMaterialAndConsumableSerializer(serializers.ModelSerializer):
    unit_name = serializers.CharField(source='unit.name', read_only=True)
    unit_symbol = serializers.CharField(source='unit.symbol', read_only=True)
    secondary_unit_name = serializers.CharField(source='secondary_unit.name', read_only=True)
    secondary_unit_symbol = serializers.CharField(source='secondary_unit.symbol', read_only=True)
    type_display = serializers.CharField(source='get_type_display', read_only=True)

    class Meta:
        model  = RawMaterialAndConsumable
        fields = ['id', 'name', 'type', 'type_display', 'unit', 'unit_name', 'unit_symbol', 'secondary_unit', 'secondary_unit_name', 'secondary_unit_symbol', 'capacity_value']
        read_only_fields = ['id']

    def validate_name(self, value):
        return value.strip()

# ── Asset ──────────────────────────────────────────────────────────────────────

class AssetParameterSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssetParameter
        fields = ['id', 'key', 'value', 'unit']


class AssetSerializer(serializers.ModelSerializer):
    parameters = AssetParameterSerializer(many=True, read_only=True)
    capacity_unit_symbol = serializers.CharField(source='capacity_unit.symbol', read_only=True)

    class Meta:
        model = Asset
        fields = [
            'id',
            'name',
            'asset_type',
            'capacity',
            'capacity_unit',
            'capacity_unit_symbol',
            'status',
            'parameters',
        ]
        read_only_fields = ['id']

# ── Product Group ─────────────────────────────────────────────────────────────

class ProductGroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductGroup
        fields = ['id', 'name']
        read_only_fields = ['id']

# ── Product Sub-Group ────────────────────────────────────────────────────────

class ProductSubGroupSerializer(serializers.ModelSerializer):
    group_name = serializers.CharField(source='group.name', read_only=True)

    class Meta:
        model = ProductSubGroup
        fields = ['id', 'name', 'group', 'group_name']
        read_only_fields = ['id', 'group_name']


# ── Product Segment ──────────────────────────────────────────────────────────

class ProductSegmentSerializer(serializers.ModelSerializer):

    class Meta:
        model = ProductSegment
        fields = ['id', 'name']
        read_only_fields = ['id']


# ── Product Serializer ────────────────────────────────────────────────────────

class ProductSerializer(serializers.ModelSerializer):
    unit_name = serializers.CharField(source='unit.name', read_only=True)
    unit_symbol = serializers.CharField(source='unit.symbol', read_only=True)

    class Meta:
        model = Product
        fields = [
            'id', 'name', 'description', 'is_available',
            'unit', 'unit_name', 'unit_symbol',
        ]
        read_only_fields = ['id', 'unit_name', 'unit_symbol']


# ── Finished Product Serializer ───────────────────────────────────────────────

class FinishedProductSerializer(serializers.ModelSerializer):
    base_product_name        = serializers.CharField(source='base_product.name', read_only=True)
    base_product_unit_symbol = serializers.CharField(source='base_product.unit.symbol', read_only=True)
    product_group_name       = serializers.CharField(source='product_group.name', read_only=True)
    product_segment_name     = serializers.CharField(source='product_segment.name', read_only=True)
    product_sub_group_name   = serializers.CharField(source='product_sub_group.name', read_only=True)
    variant_count            = serializers.SerializerMethodField()

    class Meta:
        model = FinishedProduct
        fields = [
            'id', 'name', 'description', 'is_available',
            'base_product', 'base_product_name', 'base_product_unit_symbol',
            'product_group', 'product_group_name',
            'product_segment', 'product_segment_name',
            'product_sub_group', 'product_sub_group_name',
            'variant_count',
        ]
        read_only_fields = [
            'id', 'base_product_name', 'base_product_unit_symbol',
            'product_group_name', 'product_segment_name', 'product_sub_group_name',
            'variant_count',
        ]

    def get_variant_count(self, obj):
        return obj.variants.count()


# ── Finished Product Variant Serializer ──────────────────────────────────────

class FinishedProductVariantSerializer(serializers.ModelSerializer):
    finished_product_name  = serializers.CharField(source='finished_product.name', read_only=True)
    unit_name              = serializers.CharField(source='unit.name', read_only=True)
    unit_symbol            = serializers.CharField(source='unit.symbol', read_only=True)
    material_display       = serializers.CharField(source='get_material_display', read_only=True)
    volume_unit_name       = serializers.CharField(source='volume_unit.name', read_only=True)
    volume_unit_symbol     = serializers.CharField(source='volume_unit.symbol', read_only=True)
    secondary_unit_name    = serializers.CharField(source='secondary_unit.name', read_only=True)
    secondary_unit_symbol  = serializers.CharField(source='secondary_unit.symbol', read_only=True)
    display_label          = serializers.SerializerMethodField()
    # Expose base_product info so PackagingOrder can show it without extra calls
    base_product_name      = serializers.CharField(source='finished_product.base_product.name', read_only=True)
    base_product_unit_symbol = serializers.CharField(source='finished_product.base_product.unit.symbol', read_only=True)

    class Meta:
        model = FinishedProductVariant
        fields = [
            'id', 'finished_product', 'finished_product_name',
            'base_product_name', 'base_product_unit_symbol',
            'unit', 'unit_name', 'unit_symbol',
            'material', 'material_display',
            'volume', 'volume_unit', 'volume_unit_name', 'volume_unit_symbol',
            'secondary_unit', 'secondary_unit_name', 'secondary_unit_symbol',
            'capacity_value', 'base_quantity',
            'sku_code', 'is_available',
            'added_sticker', 'sticker_name',
            'display_label',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'finished_product_name', 'base_product_name', 'base_product_unit_symbol',
            'unit_name', 'unit_symbol', 'material_display',
            'volume_unit_name', 'volume_unit_symbol',
            'secondary_unit_name', 'secondary_unit_symbol',
            'display_label', 'created_at', 'updated_at',
        ]

    def get_display_label(self, obj):
        material = f" ({obj.get_material_display()})" if obj.material else ""
        return f"{obj.finished_product.name} {obj.volume}{obj.volume_unit.symbol} {obj.unit.name}{material}"

class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = [
            'id',
            'name',
            'contact_person',
            'phone',
            'email',
            'address',
            'is_active',
            'created_at',
            'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']