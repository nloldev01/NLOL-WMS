from decimal import Decimal
from rest_framework import serializers

from master_data.models import RawMaterialAndConsumable
from .models import ConsumableRequest, ConsumableRequestItem


class ConsumableRequestItemSerializer(serializers.ModelSerializer):
    material_name = serializers.ReadOnlyField(source='material.name')
    unit          = serializers.ReadOnlyField(source='material.unit.name')
    unit_symbol   = serializers.ReadOnlyField(source='material.unit.symbol')

    class Meta:
        model  = ConsumableRequestItem
        fields = [
            'id', 'request',
            'material', 'material_name', 'unit', 'unit_symbol',
            'requested_quantity', 'approved_quantity', 'dispatched_quantity',
            'used_quantity', 'returned_quantity',
        ]
        read_only_fields = [
            'id', 'material_name', 'unit', 'unit_symbol',
            'approved_quantity', 'dispatched_quantity',
            'used_quantity', 'returned_quantity',
        ]

    def validate_material(self, value):
        if value.type != 'consumable':
            raise serializers.ValidationError(f"'{value.name}' is not a consumable.")
        return value

    def validate_requested_quantity(self, value):
        if Decimal(str(value)) <= 0:
            raise serializers.ValidationError('Quantity must be greater than zero.')
        if Decimal(str(value)) > Decimal('999999'):
            raise serializers.ValidationError('Quantity exceeds maximum allowed value.')
        return value


class ConsumableRequestSerializer(serializers.ModelSerializer):
    items                  = ConsumableRequestItemSerializer(many=True, read_only=True)
    status_display         = serializers.CharField(source='get_status_display', read_only=True)
    source_location_name   = serializers.ReadOnlyField(source='source_location.name')
    destination_location_name = serializers.ReadOnlyField(source='destination_location.name')
    created_by_name        = serializers.ReadOnlyField(source='created_by.fullname')
    approved_by_name       = serializers.ReadOnlyField(source='approved_by.fullname')
    dispatched_by_name     = serializers.ReadOnlyField(source='dispatched_by.fullname')
    returned_by_name       = serializers.ReadOnlyField(source='returned_by.fullname')
    total_items            = serializers.SerializerMethodField()
    total_requested        = serializers.SerializerMethodField()
    total_dispatched       = serializers.SerializerMethodField()
    total_used             = serializers.SerializerMethodField()
    total_returned         = serializers.SerializerMethodField()

    class Meta:
        model  = ConsumableRequest
        fields = [
            'id', 'request_number', 'status', 'status_display',
            'source_location', 'source_location_name',
            'destination_location', 'destination_location_name',
            'assembly_reference', 'notes', 'rejection_reason',
            'created_by', 'created_by_name',
            'approved_by', 'approved_by_name',
            'dispatched_by', 'dispatched_by_name',
            'returned_by', 'returned_by_name',
            'created_at', 'updated_at', 'approved_at', 'dispatched_at', 'returned_at',
            'items', 'total_items',
            'total_requested', 'total_dispatched', 'total_used', 'total_returned',
        ]
        read_only_fields = [
            'id', 'request_number', 'status', 'status_display',
            'destination_location', 'destination_location_name',
            'rejection_reason',
            'created_by', 'created_by_name',
            'approved_by', 'approved_by_name',
            'dispatched_by', 'dispatched_by_name',
            'returned_by', 'returned_by_name',
            'created_at', 'updated_at', 'approved_at', 'dispatched_at', 'returned_at',
            'items', 'total_items',
        ]

    def get_total_items(self, obj):
        return obj.items.count()

    def _sum(self, obj, field):
        return sum((getattr(i, field) or 0) for i in obj.items.all())

    def get_total_requested(self, obj):
        return self._sum(obj, 'requested_quantity')

    def get_total_dispatched(self, obj):
        return self._sum(obj, 'dispatched_quantity')

    def get_total_used(self, obj):
        return self._sum(obj, 'used_quantity')

    def get_total_returned(self, obj):
        return self._sum(obj, 'returned_quantity')

    def create(self, validated_data):
        validated_data['request_number'] = ConsumableRequest.generate_request_number()
        validated_data['created_by']     = self.context['request'].user
        return super().create(validated_data)
