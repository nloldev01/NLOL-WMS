from rest_framework import serializers
from .models import Unit, FiscalYear, Location, RawMaterialAndConsumable, Asset, AssetParameter, ProductGroup, ProductSubGroup, ProductSegment, Product, Supplier


# ── Unit ──────────────────────────────────────────────────────────────────────

class UnitSerializer(serializers.ModelSerializer):
    class Meta:
        model  = Unit
        fields = ['id', 'name', 'code', 'symbol', 'description', 'is_active']
        read_only_fields = ['id']

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
            'full_code',
            'full_path',
            'is_active',
        ]

    def get_full_code(self, obj):
        return obj.get_full_code()

    def get_full_path(self, obj):
        return obj.get_full_path()

    def validate(self, data):
        # Prevent circular parent reference
        parent = data.get('parent')
        if parent and parent == self.instance:
            raise serializers.ValidationError("A location cannot be its own parent.")
        return data
    
# ── Raw Materials & Consumables ───────────────────────────────────────────────

class RawMaterialAndConsumableSerializer(serializers.ModelSerializer):
    unit_name = serializers.CharField(source='unit.name', read_only=True)
    unit_symbol = serializers.CharField(source='unit.symbol', read_only=True)
    type_display = serializers.CharField(source='get_type_display', read_only=True)

    class Meta:
        model  = RawMaterialAndConsumable
        fields = ['id', 'name', 'type', 'type_display', 'unit', 'unit_name', 'unit_symbol']
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
    location_name = serializers.CharField(source='location.name', read_only=True)
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
            'location',
            'location_name',
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
    product_group_name = serializers.CharField(source='product_group.name', read_only=True)
    product_segment_name = serializers.CharField(source='product_segment.name', read_only=True)
    product_sub_group_name = serializers.CharField(source='product_sub_group.name', read_only=True)
    unit_name = serializers.CharField(source='unit.name', read_only=True)

    class Meta:
        model = Product
        fields = [
            'id', 'name', 'description', 'is_available',
            'product_group', 'product_group_name',
            'product_segment', 'product_segment_name',
            'product_sub_group', 'product_sub_group_name',
            'unit', 'unit_name'
        ]
        read_only_fields = ['id', 'product_group_name', 'product_segment_name', 'product_sub_group_name', 'unit_name']

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