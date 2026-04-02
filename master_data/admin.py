from django.contrib import admin
from .models import Unit, FiscalYear, Location, RawMaterialAndConsumable


@admin.register(Unit)
class UnitAdmin(admin.ModelAdmin):
    list_display  = ['name', 'code', 'symbol', 'is_active', 'created_at']
    list_filter   = ['is_active']
    search_fields = ['name', 'code', 'symbol']
    ordering      = ['name']


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