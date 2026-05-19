from django.contrib import admin
from .models import Customer, Invoice, InvoiceItem


class InvoiceItemInline(admin.TabularInline):
    model = InvoiceItem
    extra = 1
    fields = ('product_name', 'quantity', 'free_quantity', 'rate', 'amount', 'unit', 'batch', 'expiry')


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ('customer_code', 'customer_name', 'customer_type', 'phone', 'is_active', 'created_at')
    list_filter = ('customer_type', 'is_active', 'created_at')
    search_fields = ('customer_code', 'customer_name', 'phone')
    readonly_fields = ('created_at', 'updated_at')
    fieldsets = (
        ('Basic Information', {
            'fields': ('customer_code', 'customer_name', 'customer_type')
        }),
        ('Contact Information', {
            'fields': ('address', 'phone')
        }),
        ('User Account', {
            'fields': ('user',)
        }),
        ('Status', {
            'fields': ('is_active',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    list_display = ('invoice_number', 'customer', 'invoice_date', 'gross_amount', 'discount', 'net_amount', 'created_at')
    list_filter = ('invoice_date', 'created_at', 'customer')
    search_fields = ('invoice_number', 'customer__customer_name')
    readonly_fields = ('created_at', 'updated_at')
    inlines = [InvoiceItemInline]
    fieldsets = (
        ('Invoice Information', {
            'fields': ('invoice_number', 'customer', 'invoice_date')
        }),
        ('Amounts', {
            'fields': ('gross_amount', 'discount', 'net_amount')
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(InvoiceItem)
class InvoiceItemAdmin(admin.ModelAdmin):
    list_display = ('invoice', 'product_name', 'quantity', 'free_quantity', 'rate', 'amount', 'batch')
    list_filter = ('invoice__invoice_date', 'created_at')
    search_fields = ('product_name', 'invoice__invoice_number', 'batch')
    readonly_fields = ('created_at',)
    fieldsets = (
        ('Invoice', {
            'fields': ('invoice',)
        }),
        ('Product Details', {
            'fields': ('product_name', 'unit', 'batch', 'expiry')
        }),
        ('Quantities', {
            'fields': ('quantity', 'free_quantity')
        }),
        ('Pricing', {
            'fields': ('rate', 'amount')
        }),
        ('Timestamps', {
            'fields': ('created_at',),
            'classes': ('collapse',)
        }),
    )
