from decimal import Decimal
from rest_framework import serializers
from .models import ProductStock, ProductStockLog
from master_data.models import Product, Location
from inventory_core.models import Batch

class ProductStockSerializer(serializers.ModelSerializer):
    product_name = serializers.ReadOnlyField(source='product.name')
    location_name = serializers.ReadOnlyField(source='location.get_full_path')
    batch_code = serializers.ReadOnlyField(source='batch.batch_code')
    unit = serializers.ReadOnlyField(source='product.unit.symbol')

    class Meta:
        model = ProductStock
        fields = [
            'id', 'product', 'product_name', 'batch', 'batch_code',
            'location', 'location_name', 'quantity', 'unit', 'updated_at'
        ]

class ProductStockLogSerializer(serializers.ModelSerializer):
    product_name = serializers.ReadOnlyField(source='product.name')
    location_name = serializers.ReadOnlyField(source='location.get_full_path')
    counterpart_location_name = serializers.ReadOnlyField(source='counterpart_location.get_full_path')
    batch_code = serializers.ReadOnlyField(source='batch.batch_code')
    unit = serializers.ReadOnlyField(source='product.unit.symbol')
    performer_name = serializers.ReadOnlyField(source='performed_by.username')

    class Meta:
        model = ProductStockLog
        fields = [
            'id', 'product', 'product_name', 'batch', 'batch_code',
            'location', 'location_name', 'movement_type', 'quantity',
            'balance_after', 'unit', 'reference', 'notes',
            'supplier',
            'counterpart_location', 'counterpart_location_name',
            'performer_name', 'created_at'
        ]

class ProductMovementSerializer(serializers.Serializer):
    product              = serializers.PrimaryKeyRelatedField(queryset=Product.objects.all())
    location             = serializers.PrimaryKeyRelatedField(queryset=Location.objects.all())
    movement_type        = serializers.ChoiceField(choices=ProductStockLog.MOVEMENT_CHOICES)
    quantity             = serializers.DecimalField(max_digits=14, decimal_places=2, min_value=Decimal('0.01'))
    batch                = serializers.PrimaryKeyRelatedField(queryset=Batch.objects.all(), required=False, allow_null=True)
    supplier             = serializers.PrimaryKeyRelatedField(queryset=Batch.objects.all().model._meta.get_field('supplier').related_model.objects.all(), required=False, allow_null=True)
    counterpart_location = serializers.PrimaryKeyRelatedField(queryset=Location.objects.all(), required=False, allow_null=True)
    reference            = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')
    notes                = serializers.CharField(required=False, allow_blank=True, default='')
    auto_generate_batch  = serializers.BooleanField(required=False, default=False)

    def validate(self, data):
        batch = data.get('batch')
        auto_generate = data.get('auto_generate_batch')
        
        if not batch and not auto_generate:
            # Check if this movement type allows NA batch
            # For products, we usually expect a batch, but we'll allow it if needed.
            pass
            
        if data['movement_type'] == 'transfer_out' and not data.get('counterpart_location'):
            raise serializers.ValidationError({"counterpart_location": "Required for transfer movements."})
            
        return data
