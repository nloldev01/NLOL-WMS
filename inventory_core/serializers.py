from rest_framework import serializers
from .models import Batch, LPN, Pallet, PalletItem


class BatchSerializer(serializers.ModelSerializer):
    raw_material_name              = serializers.CharField(source='raw_material.name', read_only=True)
    product_name                   = serializers.CharField(source='product.name', read_only=True)
    finished_product_variant_name  = serializers.CharField(source='finished_product_variant.finished_product.name', read_only=True)
    finished_product_variant_label = serializers.CharField(source='finished_product_variant.display_label', read_only=True)
    lpns                           = serializers.SerializerMethodField()
    current_stock                  = serializers.SerializerMethodField()

    class Meta:
        model = Batch
        fields = [
            'id', 'batch_code', 'batch_type',
            'raw_material', 'raw_material_name',
            'product', 'product_name',
            'finished_product_variant', 'finished_product_variant_name', 'finished_product_variant_label',
            'supplier', 'expiry_date', 'created_at',
            'current_stock', 'lpns', 'quality_status',
        ]
        read_only_fields = ['batch_code', 'created_at']

    def get_current_stock(self, obj):
        from django.db.models import Sum
        if obj.batch_type == 'RAW':
            return obj.stock_levels.aggregate(total=Sum('quantity'))['total'] or 0
        elif obj.batch_type == 'PRD':
            return obj.product_stock_levels.aggregate(total=Sum('quantity'))['total'] or 0
        elif obj.batch_type == 'FIN':
            return obj.finished_product_stock_levels.aggregate(total=Sum('quantity'))['total'] or 0
        return 0

    def get_lpns(self, obj):
        return [{'id': lpn.id, 'lpn_code': lpn.lpn_code} for lpn in obj.lpns.all()]


class LPNSerializer(serializers.ModelSerializer):
    batch_code                    = serializers.CharField(source='batch.batch_code', read_only=True)
    batch_type                    = serializers.CharField(source='batch.batch_type', read_only=True)
    material_name                 = serializers.CharField(source='batch.raw_material.name', read_only=True)
    product_name                  = serializers.CharField(source='batch.product.name', read_only=True)
    finished_product_variant_name  = serializers.CharField(source='batch.finished_product_variant.finished_product.name', read_only=True)
    finished_product_variant_label = serializers.CharField(source='batch.finished_product_variant.display_label', read_only=True)

    class Meta:
        model = LPN
        fields = [
            'id', 'lpn_code', 'batch', 'batch_code', 'batch_type',
            'material_name', 'product_name', 'finished_product_variant_name', 'finished_product_variant_label',
            'created_at', 'is_active',
        ]


# ── Pallet ────────────────────────────────────────────────────────────────────

class PalletItemSerializer(serializers.ModelSerializer):
    lpn_code   = serializers.ReadOnlyField(source='lpn.lpn_code')
    batch_code = serializers.ReadOnlyField(source='lpn.batch.batch_code')
    batch_type = serializers.ReadOnlyField(source='lpn.batch.batch_type')
    item_label = serializers.SerializerMethodField()

    class Meta:
        model  = PalletItem
        fields = ['id', 'pallet', 'lpn', 'lpn_code', 'batch_code', 'batch_type', 'item_label', 'quantity']
        read_only_fields = ['id', 'lpn_code', 'batch_code', 'batch_type', 'item_label']

    def get_item_label(self, obj):
        b = obj.lpn.batch
        if b.batch_type == 'FIN' and b.finished_product_variant:
            try:
                v = b.finished_product_variant
                return f"{v.finished_product.name} — {v.volume}{v.volume_unit.symbol} {v.unit.name}"
            except Exception:
                return str(b.finished_product_variant)
        elif b.batch_type == 'PRD' and b.product:
            return str(b.product)
        elif b.batch_type == 'RAW' and b.raw_material:
            return str(b.raw_material)
        return b.batch_code


class PalletSerializer(serializers.ModelSerializer):
    items           = PalletItemSerializer(many=True, read_only=True)
    total_items     = serializers.SerializerMethodField()
    created_by_name = serializers.ReadOnlyField(source='created_by.fullname')

    class Meta:
        model  = Pallet
        fields = [
            'id', 'pallet_code', 'notes', 'is_sealed', 'total_items',
            'items', 'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'pallet_code', 'is_sealed', 'total_items',
            'created_by_name', 'created_at', 'updated_at',
        ]

    def get_total_items(self, obj):
        return obj.items.count()

