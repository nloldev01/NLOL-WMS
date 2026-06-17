from decimal import Decimal
from rest_framework import serializers
from .models import (
    DealerOrder, DealerOrderItem,
    DispatchOrder, DispatchItem,
    DealerStock,
    DealerSale, DealerSaleItem,
)


def _variant_label(v):
    try:
        return f"{v.finished_product.name} — {v.volume}{v.volume_unit.symbol} {v.unit.name}"
    except Exception:
        return str(v)


# ── Dealer Order ──────────────────────────────────────────────────────────────

class DealerOrderItemSerializer(serializers.ModelSerializer):
    variant_label      = serializers.SerializerMethodField()
    sku_code           = serializers.ReadOnlyField(source='finished_product_variant.sku_code')
    finished_product   = serializers.IntegerField(source='finished_product_variant.finished_product_id', read_only=True)

    class Meta:
        model  = DealerOrderItem
        fields = [
            'id', 'order',
            'finished_product_variant', 'finished_product', 'variant_label', 'sku_code',
            'requested_quantity', 'approved_quantity',
        ]
        read_only_fields = ['id', 'finished_product', 'variant_label', 'sku_code']

    def get_variant_label(self, obj):
        return _variant_label(obj.finished_product_variant)

    def validate_requested_quantity(self, value):
        if Decimal(str(value)) <= 0:
            raise serializers.ValidationError('Quantity must be greater than zero.')
        if Decimal(str(value)) > Decimal('999999'):
            raise serializers.ValidationError('Quantity exceeds maximum allowed value.')
        return value

    def validate_approved_quantity(self, value):
        if value is not None and Decimal(str(value)) < 0:
            raise serializers.ValidationError('Approved quantity cannot be negative.')
        return value


class DealerOrderSerializer(serializers.ModelSerializer):
    items              = DealerOrderItemSerializer(many=True, read_only=True)
    customer_name      = serializers.ReadOnlyField(source='customer.customer_name')
    customer_code      = serializers.ReadOnlyField(source='customer.customer_code')
    status_display     = serializers.CharField(source='get_status_display', read_only=True)
    created_by_name    = serializers.ReadOnlyField(source='created_by.fullname')
    approved_by_name   = serializers.ReadOnlyField(source='approved_by.fullname')
    total_items        = serializers.SerializerMethodField()

    class Meta:
        model  = DealerOrder
        fields = [
            'id', 'order_number', 'status', 'status_display',
            'customer', 'customer_name', 'customer_code',
            'notes', 'rejection_reason',
            'created_by', 'created_by_name',
            'approved_by', 'approved_by_name',
            'created_at', 'updated_at',
            'items', 'total_items',
        ]
        read_only_fields = [
            'id', 'order_number', 'status', 'status_display',
            'customer_name', 'customer_code',
            'rejection_reason',
            'created_by', 'created_by_name',
            'approved_by', 'approved_by_name',
            'created_at', 'updated_at',
            'items', 'total_items',
        ]

    def get_total_items(self, obj):
        return obj.items.count()

    def create(self, validated_data):
        validated_data['order_number'] = DealerOrder.generate_order_number()
        validated_data['created_by']   = self.context['request'].user
        return super().create(validated_data)


# ── Dispatch Order ────────────────────────────────────────────────────────────

class DealerOrderReferenceItemSerializer(serializers.ModelSerializer):
    variant_label = serializers.SerializerMethodField()
    sku_code      = serializers.ReadOnlyField(source='finished_product_variant.sku_code')

    class Meta:
        model  = DealerOrderItem
        fields = [
            'id', 'finished_product_variant', 'variant_label', 'sku_code',
            'requested_quantity', 'approved_quantity',
        ]
        read_only_fields = fields

    def get_variant_label(self, obj):
        return _variant_label(obj.finished_product_variant)


class DispatchItemSerializer(serializers.ModelSerializer):
    variant_label = serializers.SerializerMethodField()
    sku_code      = serializers.ReadOnlyField(source='finished_product_variant.sku_code')
    batch_code    = serializers.ReadOnlyField(source='batch.batch_code')

    class Meta:
        model  = DispatchItem
        fields = [
            'id', 'dispatch',
            'finished_product_variant', 'variant_label', 'sku_code',
            'batch', 'batch_code',
            'quantity',
        ]
        read_only_fields = ['id', 'variant_label', 'sku_code', 'batch_code']

    def get_variant_label(self, obj):
        return _variant_label(obj.finished_product_variant)

    def validate_quantity(self, value):
        if Decimal(str(value)) <= 0:
            raise serializers.ValidationError('Quantity must be greater than zero.')
        if Decimal(str(value)) > Decimal('999999'):
            raise serializers.ValidationError('Quantity exceeds maximum allowed value.')
        return value


class DispatchOrderSerializer(serializers.ModelSerializer):
    items               = DispatchItemSerializer(many=True, read_only=True)
    customer_name       = serializers.ReadOnlyField(source='customer.customer_name')
    customer_code       = serializers.ReadOnlyField(source='customer.customer_code')
    dealer_order_number = serializers.ReadOnlyField(source='dealer_order.order_number')
    status_display      = serializers.CharField(source='get_status_display', read_only=True)
    dispatched_by_name  = serializers.ReadOnlyField(source='dispatched_by.fullname')
    created_by_name     = serializers.ReadOnlyField(source='created_by.fullname')
    total_items         = serializers.SerializerMethodField()
    dealer_order_items  = serializers.SerializerMethodField()

    class Meta:
        model  = DispatchOrder
        fields = [
            'id', 'dispatch_number', 'status', 'status_display',
            'dealer_order', 'dealer_order_number', 'dealer_order_items',
            'customer', 'customer_name', 'customer_code',
            'vehicle_number', 'driver_name', 'notes', 'dealer_notes',
            'dispatched_by', 'dispatched_by_name',
            'created_by', 'created_by_name',
            'dispatched_at', 'created_at', 'updated_at',
            'items', 'total_items',
        ]
        read_only_fields = [
            'id', 'dispatch_number', 'status', 'status_display',
            'dealer_order_number', 'dealer_order_items',
            'customer_name', 'customer_code',
            'dispatched_by', 'dispatched_by_name',
            'created_by', 'created_by_name',
            'dispatched_at', 'created_at', 'updated_at',
            'items', 'total_items',
        ]

    def get_total_items(self, obj):
        return obj.items.count()

    def get_dealer_order_items(self, obj):
        if not obj.dealer_order_id:
            return []
        items = obj.dealer_order.items.select_related(
            'finished_product_variant__finished_product',
            'finished_product_variant__unit',
            'finished_product_variant__volume_unit',
        ).all()
        return DealerOrderReferenceItemSerializer(items, many=True).data

    def create(self, validated_data):
        validated_data['dispatch_number'] = DispatchOrder.generate_order_number()
        validated_data['created_by']      = self.context['request'].user
        return super().create(validated_data)


# ── Dealer Stock ──────────────────────────────────────────────────────────────

class DealerStockSerializer(serializers.ModelSerializer):
    customer_name = serializers.ReadOnlyField(source='customer.customer_name')
    customer_code = serializers.ReadOnlyField(source='customer.customer_code')
    variant_label = serializers.SerializerMethodField()
    sku_code      = serializers.ReadOnlyField(source='finished_product_variant.sku_code')

    class Meta:
        model  = DealerStock
        fields = [
            'id', 'customer', 'customer_name', 'customer_code',
            'finished_product_variant', 'variant_label', 'sku_code',
            'quantity', 'updated_at',
        ]
        read_only_fields = fields

    def get_variant_label(self, obj):
        return _variant_label(obj.finished_product_variant)


# ── Dealer Sale ───────────────────────────────────────────────────────────────

class DealerSaleItemSerializer(serializers.ModelSerializer):
    variant_label = serializers.SerializerMethodField()
    sku_code      = serializers.ReadOnlyField(source='finished_product_variant.sku_code')

    class Meta:
        model  = DealerSaleItem
        fields = [
            'id', 'sale',
            'finished_product_variant', 'variant_label', 'sku_code',
            'quantity',
        ]
        read_only_fields = ['id', 'variant_label', 'sku_code']

    def get_variant_label(self, obj):
        return _variant_label(obj.finished_product_variant)

    def validate_quantity(self, value):
        if Decimal(str(value)) <= 0:
            raise serializers.ValidationError('Quantity must be greater than zero.')
        if Decimal(str(value)) > Decimal('999999'):
            raise serializers.ValidationError('Quantity exceeds maximum allowed value.')
        return value


class DealerSaleSerializer(serializers.ModelSerializer):
    items          = DealerSaleItemSerializer(many=True, read_only=True)
    customer_name  = serializers.ReadOnlyField(source='customer.customer_name')
    customer_code  = serializers.ReadOnlyField(source='customer.customer_code')
    created_by_name = serializers.ReadOnlyField(source='created_by.fullname')
    total_items    = serializers.SerializerMethodField()

    class Meta:
        model  = DealerSale
        fields = [
            'id', 'sale_number', 'is_confirmed',
            'customer', 'customer_name', 'customer_code',
            'buyer_name', 'sale_date', 'notes',
            'created_by', 'created_by_name',
            'created_at', 'updated_at',
            'items', 'total_items',
        ]
        read_only_fields = [
            'id', 'sale_number', 'is_confirmed',
            'customer_name', 'customer_code',
            'created_by', 'created_by_name',
            'created_at', 'updated_at',
            'items', 'total_items',
        ]

    def get_total_items(self, obj):
        return obj.items.count()

    def create(self, validated_data):
        validated_data['sale_number'] = DealerSale.generate_sale_number()
        validated_data['created_by']  = self.context['request'].user
        return super().create(validated_data)
