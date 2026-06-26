from rest_framework import serializers
from .models import Recipe, RecipeItem, ProductionOrder, ProductionOrderMaterial, FirstFillTest, FirstFillTestResult
    
class RecipeItemSerializer(serializers.ModelSerializer):
    # Read: use the encrypted-then-decrypted cached name (never expose material FK id)
    material_name = serializers.SerializerMethodField()
    unit_symbol   = serializers.CharField(source='material.unit.symbol', read_only=True)

    def get_material_name(self, obj):
        # Prefer the encrypted cache; fall back to live FK lookup
        if obj.encrypted_material_name:
            return obj.encrypted_material_name  # EncryptedTextField decrypts on read
        return obj.material.name if obj.material_id else ''

    def create(self, validated_data):
        instance = super().create(validated_data)
        # Populate encrypted name cache after save
        if instance.material_id:
            instance.encrypted_material_name = instance.material.name
            instance.save(update_fields=['encrypted_material_name'])
        return instance

    def update(self, instance, validated_data):
        instance = super().update(instance, validated_data)
        if instance.material_id:
            instance.encrypted_material_name = instance.material.name
            instance.save(update_fields=['encrypted_material_name'])
        return instance

    class Meta:
        model = RecipeItem
        fields = ['id', 'material', 'material_name', 'unit_symbol', 'quantity']

class RecipeSerializer(serializers.ModelSerializer):
    items = RecipeItemSerializer(many=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_unit_symbol = serializers.CharField(source='product.unit.symbol', read_only=True, allow_null=True)

    class Meta:
        model = Recipe
        fields = [
            'id', 'product', 'product_name', 'product_unit_symbol', 'name',
            'description', 'is_active', 'items', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def create(self, validated_data):
        items_data = validated_data.pop('items')
        recipe = Recipe.objects.create(**validated_data)
        for item_data in items_data:
            RecipeItem.objects.create(recipe=recipe, **item_data)
        return recipe

    def update(self, instance, validated_data):
        items_data = validated_data.pop('items', None)
        instance.product = validated_data.get('product', instance.product)
        instance.name = validated_data.get('name', instance.name)
        instance.description = validated_data.get('description', instance.description)
        instance.is_active = validated_data.get('is_active', instance.is_active)
        instance.save()

        if items_data is not None:
            # Simple approach: delete old items and create new ones
            instance.items.all().delete()
            for item_data in items_data:
                RecipeItem.objects.create(recipe=instance, **item_data)
        
        return instance


class FirstFillTestResultSerializer(serializers.ModelSerializer):
    parameter_code = serializers.CharField(source='parameter.code', read_only=True)
    specification  = serializers.CharField(source='specification_display', read_only=True)
    value_type     = serializers.CharField(source='parameter.value_type', read_only=True)

    class Meta:
        model = FirstFillTestResult
        fields = [
            'id', 'parameter', 'parameter_code', 'value_type', 'sr_no', 'mandatory',
            'characteristic', 'unit', 'test_method',
            'spec_type', 'min_value', 'max_value', 'specification',
            'result_text', 'result_numeric', 'verdict',
        ]
        read_only_fields = ['id']


class FirstFillTestSerializer(serializers.ModelSerializer):
    results              = FirstFillTestResultSerializer(many=True, read_only=True)
    batch_code           = serializers.CharField(source='batch.batch_code', read_only=True)
    product_name         = serializers.CharField(source='batch.product.name', read_only=True)
    product_unit_symbol  = serializers.CharField(source='batch.product.unit.symbol', read_only=True, allow_null=True)
    product_category     = serializers.CharField(source='test_definition.category', read_only=True, allow_null=True)
    test_definition_name  = serializers.CharField(source='test_definition.name', read_only=True)
    test_definition_template = serializers.CharField(source='test_definition.template', read_only=True)
    status_display        = serializers.CharField(source='get_status_display', read_only=True)
    overall_verdict_display = serializers.CharField(source='get_overall_verdict_display', read_only=True)
    created_by_name       = serializers.CharField(source='created_by.fullname', read_only=True, allow_null=True)
    approved_by_name      = serializers.CharField(source='approved_by.fullname', read_only=True, allow_null=True)

    class Meta:
        model = FirstFillTest
        fields = [
            'id', 'batch', 'batch_code', 'product_name', 'product_unit_symbol', 'product_category',
            'test_definition', 'test_definition_name', 'test_definition_template',
            'status', 'status_display', 'overall_verdict', 'overall_verdict_display',
            'batch_quantity', 'quantity_unit',
            'date_of_sample_receipt', 'date_of_analysis', 'date_of_issue',
            'created_by', 'created_by_name', 'approved_by', 'approved_by_name',
            'remarks', 'results',
            'created_at', 'issued_at',
        ]
        read_only_fields = [
            'id', 'status', 'overall_verdict', 'created_by', 'approved_by',
            'created_at', 'issued_at',
        ]


class ProductionOrderMaterialSerializer(serializers.ModelSerializer):
    material_name = serializers.CharField(source='material.name', read_only=True)
    unit_symbol = serializers.CharField(source='material.unit.symbol', read_only=True)

    class Meta:
        model = ProductionOrderMaterial
        fields = [
            'id', 'material', 'material_name', 'unit_symbol',
            'planned_qty', 'actual_load_qty', 'actual_consumed_qty', 'wastage_qty', 'is_loaded'
        ]

class ProductionOrderSerializer(serializers.ModelSerializer):
    materials           = ProductionOrderMaterialSerializer(many=True, read_only=True)
    product_name        = serializers.SerializerMethodField()
    recipe_name         = serializers.SerializerMethodField()
    display_name        = serializers.SerializerMethodField()
    kettle_name         = serializers.CharField(source='kettle.name', read_only=True)
    status_display      = serializers.CharField(source='get_status_display', read_only=True)
    produced_batch_code = serializers.SerializerMethodField()

    def get_product_name(self, obj):
        return obj.recipe.product.name if obj.recipe else None

    def get_recipe_name(self, obj):
        return obj.recipe.name if obj.recipe else None

    def get_display_name(self, obj):
        if obj.recipe:
            return obj.recipe.product.name
        return f"Custom Mix ({obj.mixture_id or obj.order_number})"

    target_unit_symbol = serializers.SerializerMethodField()

    def get_target_unit_symbol(self, obj):
        if obj.recipe and obj.recipe.product and obj.recipe.product.unit:
            return obj.recipe.product.unit.symbol
        return None

    def get_produced_batch_code(self, obj):
        return obj.produced_batch.batch_code if obj.produced_batch else None

    class Meta:
        model = ProductionOrder
        fields = [
            'id', 'order_number', 'mixture_id',
            'recipe', 'recipe_name', 'product_name', 'display_name',
            'kettle', 'kettle_name', 'status', 'status_display',
            'target_quantity', 'produced_quantity', 'target_unit_symbol',
            'start_time', 'expected_end_time', 'actual_end_time',
            'mixing_temperature', 'operator_notes',
            'produced_batch', 'produced_batch_code',
            'materials_confirmed',
            'materials', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'mixture_id', 'produced_batch', 'created_at', 'updated_at']
