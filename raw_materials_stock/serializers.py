from decimal import Decimal
from rest_framework import serializers
from inventory_core.models import Batch
from master_data.models import RawMaterialAndConsumable, Location
from .models import RawMaterialStock, RawMaterialStockLog


class LocationSerializer(serializers.ModelSerializer):
    full_path = serializers.CharField(source='get_full_path', read_only=True)

    class Meta:
        model  = Location
        fields = ['id', 'name', 'short_code', 'type', 'parent', 'full_path', 'is_active']

class RawMaterialStockSerializer(serializers.ModelSerializer):
    material_name = serializers.CharField(source='material.name', read_only=True)
    material_type = serializers.CharField(source='material.get_type_display', read_only=True)
    unit          = serializers.CharField(source='material.unit', read_only=True)
    location_name = serializers.CharField(source='location.get_full_path', read_only=True)
    batch         = serializers.PrimaryKeyRelatedField(queryset=Batch.objects.all(), required=False, allow_null=True)
    batch_code    = serializers.CharField(source='batch.batch_code', read_only=True)
    lpn_code      = serializers.CharField(source='lpn.lpn_code', read_only=True)
    
    # FIX: Add explicit location field to handle ID-to-object conversion
    location = serializers.PrimaryKeyRelatedField(
        queryset=Location.objects.all()
    )

    class Meta:
        model  = RawMaterialStock
        fields = [
            'id',
            'material', 'material_name', 'material_type',
            'location', 'location_name',
            'batch', 'batch_code', 'lpn', 'lpn_code',
            'quantity', 'unit',
            'updated_at',
        ]
        read_only_fields = ['quantity', 'updated_at']


class RawMaterialStockLogSerializer(serializers.ModelSerializer):
    material_name = serializers.CharField(source='material.name', read_only=True)
    unit = serializers.CharField(source='material.unit', read_only=True)
    location_name = serializers.CharField(source='location.get_full_path', read_only=True)

    counterpart_location_name = serializers.CharField(
        source='counterpart_location.get_full_path',
        read_only=True
    )

    movement_type_display = serializers.CharField(
        source='get_movement_type_display',
        read_only=True
    )

    performed_by_name = serializers.CharField(
        source='performed_by.get_full_name',
        read_only=True
    )

    batch = serializers.PrimaryKeyRelatedField(
        queryset=Batch.objects.all(),
        required=False,
        allow_null=True
    )
    batch_code = serializers.ReadOnlyField(source='batch.batch_code')
    lpn_code = serializers.ReadOnlyField(source='lpn.lpn_code')

    class Meta:
        model = RawMaterialStockLog
        fields = [
            'id',
            'material', 'material_name', 'unit',
            'location', 'location_name',
            'counterpart_location', 'counterpart_location_name',
            'movement_type', 'movement_type_display',
            'quantity', 'balance_after',
            'batch', 'batch_code', 'lpn', 'lpn_code',
            'supplier',
            'reference', 'notes',
            'performed_by', 'performed_by_name',
            'created_at',
        ]
        read_only_fields = [
            'balance_after',
            'created_at',
            'material_name',
            'unit',
            'location_name',
            'counterpart_location_name',
            'movement_type_display',
            'performed_by_name',
        ]


class StockMovementSerializer(serializers.Serializer):
    """
    Used only for POST /stock-movements/record/
    Validates input then calls RawMaterialStockLog.create_movement().
    """
    MOVEMENT_CHOICES = RawMaterialStockLog.MOVEMENT_CHOICES

    material = serializers.PrimaryKeyRelatedField(
        queryset=RawMaterialAndConsumable.objects.all()
    )
    batch = serializers.PrimaryKeyRelatedField(
        queryset=Batch.objects.all(),
        required=False,
        allow_null=True
    )
    movement_type = serializers.ChoiceField(choices=MOVEMENT_CHOICES)
    quantity      = serializers.DecimalField(max_digits=14, decimal_places=4, min_value=Decimal('0.0001'))
    location = serializers.PrimaryKeyRelatedField(
        queryset=Location.objects.filter(is_active=True)
    )
    counterpart_location = serializers.PrimaryKeyRelatedField(
        queryset=Location.objects.filter(is_active=True),
        required=False,
        allow_null=True,
    )
    lpn = serializers.PrimaryKeyRelatedField(queryset=Batch.objects.all().model._meta.get_field('lpns').related_model.objects.all(), required=False, allow_null=True)
    supplier      = serializers.PrimaryKeyRelatedField(queryset=Batch.objects.all().model._meta.get_field('supplier').related_model.objects.all(), required=False, allow_null=True)
    reference     = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')
    notes         = serializers.CharField(required=False, allow_blank=True, default='')
    auto_generate_batch = serializers.BooleanField(required=False, default=False)
    auto_generate_lpn = serializers.BooleanField(required=False, default=False)

    def validate(self, data):
        batch = data.get('batch')
        material = data.get('material')

        if batch and batch.raw_material_id != material.id:
            raise serializers.ValidationError(
                {"batch": "This batch does not belong to selected material."}
            )
        if data.get('movement_type') == 'transfer_out' and not data.get('counterpart_location'):
            raise serializers.ValidationError(
                {'counterpart_location': 'This field is required for transfers.'}
            )
        if (
            data.get('counterpart_location') and
            data.get('location') == data.get('counterpart_location')
        ):
            raise serializers.ValidationError(
                {'counterpart_location': 'Source and destination location cannot be the same.'}
            )
        return data