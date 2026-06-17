from django.contrib import admin
from .models import Unit, FiscalYear, Location, RawMaterialAndConsumable, Product, FinishedProduct, FinishedProductVariant, ProductGroup, ProductSubGroup, ProductSegment

@admin.register(Unit)
class UnitAdmin(admin.ModelAdmin):
    list_display  = ['name', 'code', 'symbol', 'unit_type', 'base_unit', 'is_active', 'created_at']
    list_filter   = ['is_active', 'unit_type']
    search_fields = ['name', 'code', 'symbol']
    ordering      = ['name']
    fields        = ['name', 'code', 'symbol', 'unit_type', 'icon', 'base_unit', 'description', 'is_active']


@admin.register(FiscalYear)
class FiscalYearAdmin(admin.ModelAdmin):
    list_display  = ['name', 'start_date', 'end_date', 'is_active']
    list_filter   = ['is_active']
    search_fields = ['name']
    ordering      = ['-start_date']


@admin.register(Location)
class LocationAdmin(admin.ModelAdmin):
    list_display  = ['name', 'short_code', 'type', 'parent', 'is_active']
    list_filter   = ['type', 'is_active']
    search_fields = ['name', 'short_code']
    ordering      = ['type', 'name']


@admin.register(RawMaterialAndConsumable)
class RawMaterialAndConsumableAdmin(admin.ModelAdmin):
    list_display  = ['name', 'type', 'unit']
    list_filter   = ['type']
    search_fields = ['name']
    ordering      = ['name']


@admin.register(ProductGroup)
class ProductGroupAdmin(admin.ModelAdmin):
    list_display = ('name',)
    search_fields = ('name',)


@admin.register(ProductSubGroup)
class ProductSubGroupAdmin(admin.ModelAdmin):
    list_display = ('name',)
    search_fields = ('name',)


@admin.register(ProductSegment)
class ProductSegmentAdmin(admin.ModelAdmin):
    list_display = ('name',)
    search_fields = ('name',)


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'unit', 'is_available')
    list_filter = ('is_available',)
    search_fields = ('name', 'description')


@admin.register(FinishedProduct)
class FinishedProductAdmin(admin.ModelAdmin):
    list_display = ('name', 'base_product', 'product_group', 'is_available')
    list_filter = ('is_available', 'product_group')
    search_fields = ('name', 'description', 'base_product__name')


@admin.register(FinishedProductVariant)
class FinishedProductVariantAdmin(admin.ModelAdmin):
    list_display = ('finished_product', 'unit', 'material', 'volume', 'volume_unit', 'sku_code', 'is_available', 'added_sticker')
    list_filter = ('is_available', 'added_sticker', 'material', 'unit')
    search_fields = ('finished_product__name', 'sku_code')

