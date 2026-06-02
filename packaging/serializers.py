from rest_framework import serializers
from .models import PackagingOrder


class PackagingOrderSerializer(serializers.ModelSerializer):
    assembly_order_number          = serializers.ReadOnlyField(source='assembly_order.assembly_number')
    # Variant fields — prefer direct variant, fall back to assembly_order's variant
    finished_product_variant_label = serializers.SerializerMethodField()
    finished_product_name          = serializers.SerializerMethodField()
    added_sticker                  = serializers.SerializerMethodField()
    sticker_name                   = serializers.SerializerMethodField()
    volume_unit_symbol             = serializers.SerializerMethodField()
    unit_name                      = serializers.SerializerMethodField()
    destination_location_name      = serializers.SerializerMethodField()
    produced_batch_code            = serializers.ReadOnlyField(source='produced_batch.batch_code')
    produced_lpn_code              = serializers.ReadOnlyField(source='produced_lpn.lpn_code')
    status_display                 = serializers.CharField(source='get_status_display', read_only=True)
    # Resolved quantity (from linked assembly order)
    assembled_quantity             = serializers.SerializerMethodField()

    class Meta:
        model = PackagingOrder
        fields = [
            'id', 'order_number', 'status', 'status_display',
            'assembly_order', 'assembly_order_number',
            'finished_product_variant', 'finished_product_variant_label',
            'finished_product_name', 'added_sticker', 'sticker_name',
            'volume_unit_symbol', 'unit_name',
            'destination_location', 'destination_location_name',
            'assembled_quantity',
            'sticker_confirmed',
            'produced_batch', 'produced_batch_code',
            'produced_lpn', 'produced_lpn_code',
            'operator_notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'order_number', 'status', 'status_display',
            'assembly_order_number',
            'finished_product_variant_label', 'finished_product_name',
            'added_sticker', 'sticker_name', 'volume_unit_symbol', 'unit_name',
            'destination_location_name', 'assembled_quantity',
            'produced_batch', 'produced_batch_code',
            'produced_lpn', 'produced_lpn_code',
            'created_at', 'updated_at',
        ]

    def _variant(self, obj):
        return obj.finished_product_variant or (obj.assembly_order.finished_product_variant if obj.assembly_order else None)

    def _location(self, obj):
        return obj.destination_location or (obj.assembly_order.destination_location if obj.assembly_order else None)

    def get_finished_product_variant_label(self, obj):
        v = self._variant(obj)
        return f"{v.volume}{v.volume_unit.symbol} {v.unit.name}" if v else ''

    def get_finished_product_name(self, obj):
        v = self._variant(obj)
        return v.finished_product.name if v else ''

    def get_added_sticker(self, obj):
        v = self._variant(obj)
        return v.added_sticker if v else False

    def get_sticker_name(self, obj):
        v = self._variant(obj)
        return v.sticker_name if v else ''

    def get_volume_unit_symbol(self, obj):
        v = self._variant(obj)
        return v.volume_unit.symbol if v else ''

    def get_unit_name(self, obj):
        v = self._variant(obj)
        return v.unit.name if v else ''

    def get_destination_location_name(self, obj):
        loc = self._location(obj)
        return loc.name if loc else ''

    def get_assembled_quantity(self, obj):
        if obj.assembly_order and obj.assembly_order.actual_quantity:
            return float(obj.assembly_order.actual_quantity)
        return None

    def create(self, validated_data):
        validated_data['order_number'] = PackagingOrder.generate_order_number()
        return super().create(validated_data)
