from rest_framework import serializers
from .models import Customer, Invoice, InvoiceItem


class CustomerSerializer(serializers.ModelSerializer):
    user_username = serializers.CharField(source='user.username', read_only=True, allow_null=True)

    class Meta:
        model = Customer
        fields = (
            'id', 'customer_code', 'customer_name', 'customer_type',
            'user', 'user_username', 'address', 'phone', 'is_active',
            'created_at', 'updated_at'
        )
        read_only_fields = ('created_at', 'updated_at')


class InvoiceItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InvoiceItem
        fields = (
            'id', 'invoice', 'product_name', 'quantity', 'free_quantity',
            'rate', 'amount', 'unit', 'batch', 'expiry', 'created_at'
        )
        read_only_fields = ('created_at',)


class InvoiceSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.customer_name', read_only=True)

    class Meta:
        model = Invoice
        fields = (
            'id', 'invoice_number', 'customer', 'customer_name', 'invoice_date',
            'gross_amount', 'discount', 'net_amount', 'created_at', 'updated_at'
        )
        read_only_fields = ('created_at', 'updated_at')


class InvoiceDetailSerializer(serializers.ModelSerializer):
    items = InvoiceItemSerializer(many=True)
    customer_details = CustomerSerializer(source='customer', read_only=True)

    class Meta:
        model = Invoice
        fields = (
            'id', 'invoice_number', 'customer', 'customer_details', 'invoice_date',
            'gross_amount', 'discount', 'net_amount', 'items', 'created_at', 'updated_at'
        )
        read_only_fields = ('created_at', 'updated_at')
