from rest_framework import serializers
from .models import Batch


class BatchSerializer(serializers.ModelSerializer):
    raw_material_name = serializers.CharField(
        source='raw_material.name',
        read_only=True
    )

    product_name = serializers.CharField(
        source='product.name',
        read_only=True
    )

    lpns = serializers.SerializerMethodField()

    current_stock = serializers.SerializerMethodField()

    class Meta:
        model = Batch
        fields = [
            'id',
            'batch_code',
            'batch_type',
            'raw_material',
            'raw_material_name',
            'product',
            'product_name',
            'supplier',
            'expiry_date',
            'created_at',
            'current_stock',
            'lpns',
        ]
        read_only_fields = ['batch_code', 'created_at']

    def get_current_stock(self, obj):
        from django.db.models import Sum
        if obj.batch_type == 'RAW':
            return obj.stock_levels.aggregate(total=Sum('quantity'))['total'] or 0
        elif obj.batch_type == 'PRD':
            return obj.product_stock_levels.aggregate(total=Sum('quantity'))['total'] or 0
        return 0

    def get_lpns(self, obj):
        return [{'id': lpn.id, 'lpn_code': lpn.lpn_code} for lpn in obj.lpns.all()]


class LPNSerializer(serializers.ModelSerializer):
    batch_code = serializers.CharField(source='batch.batch_code', read_only=True)
    batch_type = serializers.CharField(source='batch.batch_type', read_only=True)
    material_name = serializers.CharField(source='batch.raw_material.name', read_only=True)
    product_name = serializers.CharField(source='batch.product.name', read_only=True)

    class Meta:
        from .models import LPN
        model = LPN
        fields = [
            'id', 'lpn_code', 'batch', 'batch_code', 'batch_type', 
            'material_name', 'product_name', 'created_at', 'is_active'
        ]