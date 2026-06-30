from decimal import Decimal
from math import ceil

from rest_framework import serializers
from .models import VariantPackagingMaterial, AssemblyOrder


class VariantPackagingMaterialSerializer(serializers.ModelSerializer):
    material_name  = serializers.ReadOnlyField(source='material.name')
    unit_symbol    = serializers.ReadOnlyField(source='material.unit.symbol')
    unit_name      = serializers.ReadOnlyField(source='material.unit.name')
    material_type  = serializers.ReadOnlyField(source='material.type')

    class Meta:
        model  = VariantPackagingMaterial
        fields = ['id', 'finished_product_variant', 'material', 'material_name', 'unit_symbol', 'unit_name', 'material_type', 'quantity_per_unit']
        read_only_fields = ['id', 'material_name', 'unit_symbol', 'unit_name', 'material_type']


class AssemblyOrderSerializer(serializers.ModelSerializer):
    finished_product_name          = serializers.ReadOnlyField(source='finished_product_variant.finished_product.name')
    base_product_name              = serializers.ReadOnlyField(source='finished_product_variant.finished_product.base_product.name')
    base_product_unit_symbol       = serializers.ReadOnlyField(source='finished_product_variant.finished_product.base_product.unit.symbol')
    finished_product_variant_label = serializers.SerializerMethodField()
    volume_unit_symbol             = serializers.ReadOnlyField(source='finished_product_variant.volume_unit.symbol')
    unit_name                      = serializers.ReadOnlyField(source='finished_product_variant.unit.name')
    variant_base_quantity          = serializers.ReadOnlyField(source='finished_product_variant.base_quantity')
    source_location_name           = serializers.ReadOnlyField(source='source_location.name')
    destination_location_name      = serializers.ReadOnlyField(source='destination_location.name')
    source_batch_code              = serializers.ReadOnlyField(source='source_batch.batch_code')
    produced_batch_code            = serializers.ReadOnlyField(source='produced_batch.batch_code')
    packaging_order_number         = serializers.ReadOnlyField(source='packaging_order.order_number')
    assembly_line_name             = serializers.ReadOnlyField(source='assembly_line.name')
    assembly_line_running_product  = serializers.SerializerMethodField()
    status_display                 = serializers.CharField(source='get_status_display', read_only=True)
    print_jobs_count               = serializers.IntegerField(source='print_jobs.count', read_only=True)
    required_consumables           = serializers.SerializerMethodField()
    linked_consumable_requests     = serializers.SerializerMethodField()

    class Meta:
        model  = AssemblyOrder
        fields = [
            'id', 'assembly_number', 'status', 'status_display',
            'assembly_line', 'assembly_line_name', 'assembly_line_running_product',
            'packaging_order', 'packaging_order_number',
            'finished_product_variant', 'finished_product_name', 'base_product_name', 'base_product_unit_symbol',
            'finished_product_variant_label', 'volume_unit_symbol', 'unit_name', 'variant_base_quantity',
            'source_location', 'source_location_name',
            'source_batch', 'source_batch_code',
            'destination_location', 'destination_location_name',
            'produced_batch', 'produced_batch_code',
            'target_quantity', 'actual_quantity',
            'notes',
            'print_jobs_count',
            'required_consumables', 'linked_consumable_requests',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'assembly_number', 'status', 'status_display',
            'finished_product_name', 'base_product_name', 'base_product_unit_symbol',
            'finished_product_variant_label', 'volume_unit_symbol', 'unit_name', 'variant_base_quantity',
            'assembly_line_name', 'assembly_line_running_product',
            'source_location_name', 'destination_location_name',
            'source_batch_code', 'produced_batch_code',
            'packaging_order_number',
            'actual_quantity',
            'print_jobs_count',
            'required_consumables', 'linked_consumable_requests',
            'created_at', 'updated_at',
        ]

    def get_assembly_line_running_product(self, obj):
        if not obj.assembly_line_id:
            return None
        running = AssemblyOrder.objects.filter(
            assembly_line_id=obj.assembly_line_id,
            status='in_progress',
        ).values('finished_product_variant__finished_product__name').first()
        return running['finished_product_variant__finished_product__name'] if running else None

    def get_finished_product_variant_label(self, obj):
        v = obj.finished_product_variant
        return f"{v.volume}{v.volume_unit.symbol} {v.unit.name}"

    def get_required_consumables(self, obj):
        """Consumables the order will consume, from the variant's Packaging BOM.
        Quantities are whole units: ceil(qty_per_unit × order quantity)."""
        basis = obj.actual_quantity or obj.target_quantity or Decimal('0')
        rows = []
        for bom in obj.finished_product_variant.packaging_materials.select_related('material', 'material__unit').all():
            if bom.material.type != 'consumable':
                continue
            rows.append({
                'material':          bom.material_id,
                'material_name':     bom.material.name,
                'unit_symbol':       bom.material.unit.symbol if bom.material.unit else '',
                'quantity_per_unit': bom.quantity_per_unit,
                'required_quantity': int(ceil(bom.quantity_per_unit * basis)),
            })
        return rows

    def get_linked_consumable_requests(self, obj):
        """Consumable requests raised for this order, matched by the free-text
        assembly_reference (= assembly_number)."""
        from consumables.models import ConsumableRequest
        reqs = (
            ConsumableRequest.objects
            .filter(assembly_reference=obj.assembly_number)
            .prefetch_related('items')
            .order_by('-created_at')
        )

        def _sum(items, field):
            return sum((getattr(i, field) or Decimal('0')) for i in items)

        out = []
        for r in reqs:
            items = list(r.items.all())
            out.append({
                'id':               r.id,
                'request_number':   r.request_number,
                'status':           r.status,
                'status_display':   r.get_status_display(),
                'total_requested':  _sum(items, 'requested_quantity'),
                'total_dispatched': _sum(items, 'dispatched_quantity'),
                'total_used':       _sum(items, 'used_quantity'),
                'total_returned':   _sum(items, 'returned_quantity'),
            })
        return out

    def validate_source_batch(self, value):
        if value is not None and value.quality_status != 'passed':
            raise serializers.ValidationError(
                f"This batch has not passed its First Fill Test (status: {value.get_quality_status_display()}) "
                f"and cannot be used in Assembly."
            )
        return value

    def create(self, validated_data):
        validated_data['assembly_number'] = AssemblyOrder.generate_order_number()
        return super().create(validated_data)
