from rest_framework import serializers
from .models import Recipe, RecipeItem, ProductionOrder, ProductionOrderMaterial
    
class RecipeItemSerializer(serializers.ModelSerializer):
    material_name = serializers.CharField(source='material.name', read_only=True)
    unit_symbol = serializers.CharField(source='material.unit.symbol', read_only=True)

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
