from rest_framework import serializers
from .models import VariantPackagingMaterial, AssemblyMaterialLine, AssemblyOrder


class VariantPackagingMaterialSerializer(serializers.ModelSerializer):
    material_name  = serializers.ReadOnlyField(source='material.name')
    unit_symbol    = serializers.ReadOnlyField(source='material.unit.symbol')
    unit_name      = serializers.ReadOnlyField(source='material.unit.name')
    material_type  = serializers.ReadOnlyField(source='material.type')

    class Meta:
        model  = VariantPackagingMaterial
        fields = ['id', 'finished_product_variant', 'material', 'material_name', 'unit_symbol', 'unit_name', 'material_type', 'quantity_per_unit']
        read_only_fields = ['id', 'material_name', 'unit_symbol', 'unit_name', 'material_type']


class AssemblyMaterialLineSerializer(serializers.ModelSerializer):
    material_name  = serializers.ReadOnlyField(source='material.name')
    unit_symbol    = serializers.ReadOnlyField(source='material.unit.symbol')
    unit_name      = serializers.ReadOnlyField(source='material.unit.name')
    material_type  = serializers.ReadOnlyField(source='material.type')
    location_name  = serializers.ReadOnlyField(source='location.name')

    class Meta:
        model  = AssemblyMaterialLine
        fields = ['id', 'assembly_order', 'material', 'material_name', 'unit_symbol', 'unit_name',
                  'material_type', 'quantity', 'location', 'location_name']
        read_only_fields = ['id', 'material_name', 'unit_symbol', 'unit_name', 'material_type', 'location_name']


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
    material_lines                 = serializers.SerializerMethodField()

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
            'notes', 'material_lines',
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
            'actual_quantity', 'material_lines',
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

    def get_material_lines(self, obj):
        lines = obj.material_lines.select_related('material', 'material__unit', 'location').all()
        return AssemblyMaterialLineSerializer(lines, many=True).data

    def create(self, validated_data):
        validated_data['assembly_number'] = AssemblyOrder.generate_order_number()
        return super().create(validated_data)
