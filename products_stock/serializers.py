from decimal import Decimal
from rest_framework import serializers
from .models import ProductStock, ProductStockLog, FinishedProductStock, FinishedProductStockLog
from master_data.models import Product, FinishedProduct, FinishedProductVariant, Location
from inventory_core.models import Batch


# ── Bulk Product Stock ────────────────────────────────────────────────────────

class ProductStockSerializer(serializers.ModelSerializer):
    product_name  = serializers.ReadOnlyField(source='product.name')
    location_name = serializers.ReadOnlyField(source='location.get_full_path')
    batch_code    = serializers.ReadOnlyField(source='batch.batch_code')
    lpn_code      = serializers.ReadOnlyField(source='lpn.lpn_code')
    unit          = serializers.ReadOnlyField(source='product.unit.symbol')

    class Meta:
        model  = ProductStock
        fields = [
            'id', 'product', 'product_name', 'batch', 'batch_code', 'lpn', 'lpn_code',
            'location', 'location_name', 'quantity', 'unit', 'updated_at',
        ]


class ProductStockLogSerializer(serializers.ModelSerializer):
    product_name               = serializers.ReadOnlyField(source='product.name')
    location_name              = serializers.ReadOnlyField(source='location.get_full_path')
    counterpart_location_name  = serializers.ReadOnlyField(source='counterpart_location.get_full_path')
    batch_code                 = serializers.ReadOnlyField(source='batch.batch_code')
    lpn_code                   = serializers.ReadOnlyField(source='lpn.lpn_code')
    unit                       = serializers.ReadOnlyField(source='product.unit.symbol')
    performer_name             = serializers.SerializerMethodField()

    def get_performer_name(self, obj):
        if not obj.performed_by:
            return None
        return obj.performed_by.fullname or obj.performed_by.username

    class Meta:
        model  = ProductStockLog
        fields = [
            'id', 'product', 'product_name', 'batch', 'batch_code', 'lpn', 'lpn_code',
            'location', 'location_name', 'movement_type', 'quantity',
            'balance_after', 'unit', 'reference', 'notes',
            'supplier',
            'counterpart_location', 'counterpart_location_name',
            'performer_name', 'created_at',
        ]


class ProductMovementSerializer(serializers.Serializer):
    product              = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    location             = serializers.PrimaryKeyRelatedField(queryset=Location.objects.all())
    movement_type        = serializers.ChoiceField(choices=ProductStockLog.MOVEMENT_CHOICES)
    quantity             = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal('0.01'))
    batch                = serializers.PrimaryKeyRelatedField(queryset=Batch.objects.all(), required=False, allow_null=True)
    lpn                  = serializers.PrimaryKeyRelatedField(queryset=Batch.objects.all().model._meta.get_field('lpns').related_model.objects.all(), required=False, allow_null=True)
    supplier             = serializers.PrimaryKeyRelatedField(queryset=Batch.objects.all().model._meta.get_field('supplier').related_model.objects.all(), required=False, allow_null=True)
    counterpart_location = serializers.PrimaryKeyRelatedField(queryset=Location.objects.all(), required=False, allow_null=True)
    reference            = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')
    notes                = serializers.CharField(required=False, allow_blank=True, default='')
    auto_generate_batch  = serializers.BooleanField(required=False, default=False)
    auto_generate_lpn    = serializers.BooleanField(required=False, default=False)

    def validate(self, data):
        if data['movement_type'] == 'transfer_out' and not data.get('counterpart_location'):
            raise serializers.ValidationError({"counterpart_location": "Required for transfer movements."})
        return data


# ── Finished Product Stock ────────────────────────────────────────────────────

class FinishedProductStockSerializer(serializers.ModelSerializer):
    finished_product_variant_label = serializers.ReadOnlyField(source='finished_product_variant.display_label')
    finished_product_name  = serializers.ReadOnlyField(source='finished_product_variant.finished_product.name')
    location_name          = serializers.ReadOnlyField(source='location.get_full_path')
    batch_code             = serializers.ReadOnlyField(source='batch.batch_code')
    lpn_code               = serializers.ReadOnlyField(source='lpn.lpn_code')
    unit                   = serializers.ReadOnlyField(source='finished_product_variant.unit.symbol')
    unit_name              = serializers.ReadOnlyField(source='finished_product_variant.unit.name')
    volume_per_unit        = serializers.ReadOnlyField(source='finished_product_variant.volume')
    volume_unit_symbol     = serializers.ReadOnlyField(source='finished_product_variant.volume_unit.symbol')
    secondary_unit         = serializers.ReadOnlyField(source='finished_product_variant.secondary_unit.symbol')
    secondary_quantity     = serializers.SerializerMethodField()

    def get_secondary_quantity(self, obj):
        v = obj.finished_product_variant
        if v and v.capacity_value:
            return round(obj.quantity * v.capacity_value, 4)
        return None

    class Meta:
        model  = FinishedProductStock
        fields = [
            'id', 'finished_product_variant', 'finished_product_variant_label', 'finished_product_name',
            'batch', 'batch_code', 'lpn', 'lpn_code',
            'location', 'location_name',
            'quantity', 'unit', 'unit_name', 'volume_per_unit', 'volume_unit_symbol', 'secondary_quantity', 'secondary_unit',
            'updated_at',
        ]


class FinishedProductStockLogSerializer(serializers.ModelSerializer):
    finished_product_variant_label = serializers.ReadOnlyField(source='finished_product_variant.display_label')
    finished_product_name         = serializers.ReadOnlyField(source='finished_product_variant.finished_product.name')
    location_name                 = serializers.ReadOnlyField(source='location.get_full_path')
    counterpart_location_name     = serializers.ReadOnlyField(source='counterpart_location.get_full_path')
    batch_code                    = serializers.ReadOnlyField(source='batch.batch_code')
    lpn_code                      = serializers.ReadOnlyField(source='lpn.lpn_code')
    unit                          = serializers.ReadOnlyField(source='finished_product_variant.unit.symbol')
    unit_name                     = serializers.ReadOnlyField(source='finished_product_variant.unit.name')
    volume_per_unit               = serializers.ReadOnlyField(source='finished_product_variant.volume')
    volume_unit_symbol            = serializers.ReadOnlyField(source='finished_product_variant.volume_unit.symbol')
    secondary_unit                = serializers.ReadOnlyField(source='finished_product_variant.secondary_unit.symbol')
    performer_name                = serializers.SerializerMethodField()
    secondary_quantity            = serializers.SerializerMethodField()
    secondary_balance_after       = serializers.SerializerMethodField()

    def get_performer_name(self, obj):
        if not obj.performed_by:
            return None
        return obj.performed_by.fullname or obj.performed_by.username

    def get_secondary_quantity(self, obj):
        v = obj.finished_product_variant
        if v and v.capacity_value:
            return round(obj.quantity * v.capacity_value, 4)
        return None

    def get_secondary_balance_after(self, obj):
        v = obj.finished_product_variant
        if v and v.capacity_value:
            return round(obj.balance_after * v.capacity_value, 4)
        return None

    class Meta:
        model  = FinishedProductStockLog
        fields = [
            'id', 'finished_product_variant', 'finished_product_variant_label', 'finished_product_name',
            'batch', 'batch_code', 'lpn', 'lpn_code',
            'location', 'location_name',
            'movement_type', 'quantity', 'secondary_quantity',
            'balance_after', 'secondary_balance_after',
            'unit', 'unit_name', 'volume_per_unit', 'volume_unit_symbol', 'secondary_unit',
            'reference', 'notes', 'supplier',
            'counterpart_location', 'counterpart_location_name',
            'performer_name', 'created_at',
        ]


class FinishedProductMovementSerializer(serializers.Serializer):
    finished_product_variant = serializers.PrimaryKeyRelatedField(queryset=FinishedProductVariant.objects.all())
    location                 = serializers.PrimaryKeyRelatedField(queryset=Location.objects.all())
    movement_type            = serializers.ChoiceField(choices=FinishedProductStockLog.MOVEMENT_CHOICES)
    quantity                 = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal('0.01'))
    batch                    = serializers.PrimaryKeyRelatedField(queryset=Batch.objects.all(), required=False, allow_null=True)
    lpn                      = serializers.PrimaryKeyRelatedField(queryset=Batch.objects.all().model._meta.get_field('lpns').related_model.objects.all(), required=False, allow_null=True)
    supplier                 = serializers.PrimaryKeyRelatedField(queryset=Batch.objects.all().model._meta.get_field('supplier').related_model.objects.all(), required=False, allow_null=True)
    counterpart_location     = serializers.PrimaryKeyRelatedField(queryset=Location.objects.all(), required=False, allow_null=True)
    reference                = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')
    notes                    = serializers.CharField(required=False, allow_blank=True, default='')
    auto_generate_lpn        = serializers.BooleanField(required=False, default=False)
    auto_generate_batch      = serializers.BooleanField(required=False, default=False)

    def validate(self, data):
        if data['movement_type'] == 'transfer_out' and not data.get('counterpart_location'):
            raise serializers.ValidationError({"counterpart_location": "Required for transfer movements."})
        return data
