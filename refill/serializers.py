from rest_framework import serializers
from django.core.exceptions import ValidationError as DjangoValidationError

from .models import RefillOrder


class RefillOrderSerializer(serializers.ModelSerializer):
    source_variant_label         = serializers.SerializerMethodField()
    destination_variant_label    = serializers.SerializerMethodField()
    source_batch_code            = serializers.ReadOnlyField(source='source_batch.batch_code')
    source_location_name         = serializers.ReadOnlyField(source='source_location.name')
    destination_location_name    = serializers.ReadOnlyField(source='destination_location.name')
    assembly_location_name       = serializers.ReadOnlyField(source='assembly_location.name')
    recovery_batch_code          = serializers.ReadOnlyField(source='recovery_batch.batch_code')
    linked_assembly_number       = serializers.ReadOnlyField(source='linked_assembly_order.assembly_number')
    linked_production_number     = serializers.ReadOnlyField(source='linked_production_order.order_number')
    status_display               = serializers.CharField(source='get_status_display', read_only=True)
    mode_display                 = serializers.CharField(source='get_mode_display', read_only=True)
    calculated_output_quantity   = serializers.SerializerMethodField()

    class Meta:
        model  = RefillOrder
        fields = [
            'id', 'refill_number', 'mode', 'mode_display', 'status', 'status_display',
            'source_variant', 'source_variant_label',
            'source_batch', 'source_batch_code',
            'source_location', 'source_location_name',
            'source_quantity',
            'destination_variant', 'destination_variant_label',
            'output_quantity', 'calculated_output_quantity',
            'destination_location', 'destination_location_name',
            'assembly_location', 'assembly_location_name',
            'recovery_batch_code',
            'linked_assembly_order', 'linked_assembly_number',
            'linked_production_order', 'linked_production_number',
            'notes', 'performed_by',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'refill_number', 'status', 'status_display', 'mode_display',
            'source_variant_label', 'destination_variant_label',
            'source_batch_code', 'source_location_name', 'destination_location_name',
            'assembly_location_name',
            'recovery_batch_code', 'linked_assembly_number', 'linked_production_number',
            'linked_assembly_order', 'linked_production_order',
            'calculated_output_quantity',
            'created_at', 'updated_at',
        ]

    def get_source_variant_label(self, obj):
        v = obj.source_variant
        try:
            return f"{v.finished_product.name} — {v.volume}{v.volume_unit.symbol} {v.unit.name}"
        except Exception:
            return str(v)

    def get_destination_variant_label(self, obj):
        v = obj.destination_variant
        try:
            return f"{v.finished_product.name} — {v.volume}{v.volume_unit.symbol} {v.unit.name}"
        except Exception:
            return str(v)

    def get_calculated_output_quantity(self, obj):
        """Show auto-calculated qty even before start() is called, as a preview."""
        if obj.output_quantity:
            return obj.output_quantity
        try:
            return obj._calc_output_quantity()
        except Exception:
            return None

    def create(self, validated_data):
        validated_data['refill_number'] = RefillOrder.generate_order_number()
        return super().create(validated_data)
