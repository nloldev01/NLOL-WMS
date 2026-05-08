from rest_framework import serializers
from .models import Recipe, RecipeItem
from master_data.models import Product, RawMaterialAndConsumable

class RecipeItemSerializer(serializers.ModelSerializer):
    material_name = serializers.CharField(source='material.name', read_only=True)
    unit_symbol = serializers.CharField(source='material.unit.symbol', read_only=True)

    class Meta:
        model = RecipeItem
        fields = ['id', 'material', 'material_name', 'unit_symbol', 'quantity']

class RecipeSerializer(serializers.ModelSerializer):
    items = RecipeItemSerializer(many=True)
    product_name = serializers.CharField(source='product.name', read_only=True)

    class Meta:
        model = Recipe
        fields = [
            'id', 'product', 'product_name', 'name', 
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
