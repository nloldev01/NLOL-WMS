from django.contrib import admin
from django.utils.html import format_html
from .models import Location, RawMaterialStock, RawMaterialStockLog


@admin.register(Location)
class LocationAdmin(admin.ModelAdmin):
    list_display = ('name', 'description', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('name',)


@admin.register(RawMaterialStock)
class RawMaterialStockAdmin(admin.ModelAdmin):
    list_display = ('material', 'location', 'quantity', 'unit_display', 'updated_at')
    list_filter = ('location', 'material__type')
    search_fields = ('material__name', 'location__name')
    readonly_fields = ('quantity', 'updated_at')

    def unit_display(self, obj):
        return str(obj.material.unit) if obj.material.unit else '—'
    unit_display.short_description = 'Unit'

    def has_add_permission(self, request):
        return False  # Stock rows are created automatically

    def has_delete_permission(self, request, obj=None):
        return False  # Never delete stock rows


@admin.register(RawMaterialStockLog)
class RawMaterialStockLogAdmin(admin.ModelAdmin):
    list_display = (
        'created_at', 'material', 'movement_badge', 'quantity',
        'balance_after', 'location', 'counterpart_location',
        'reference', 'performed_by',
    )
    list_filter = ('movement_type', 'location', 'material__type', 'created_at')
    search_fields = ('material__name', 'reference', 'notes', 'performed_by__username')
    readonly_fields = (
        'material', 'location', 'counterpart_location', 'movement_type',
        'quantity', 'balance_after', 'unit_cost', 'reference', 'notes',
        'performed_by', 'created_at',
    )
    date_hierarchy = 'created_at'

    BADGE_COLORS = {
        'purchase':     ('#d1fae5', '#065f46'),
        'return':       ('#dbeafe', '#1e40af'),
        'transfer_in':  ('#ede9fe', '#5b21b6'),
        'usage':        ('#fef3c7', '#92400e'),
        'wastage':      ('#fee2e2', '#991b1b'),
        'transfer_out': ('#fce7f3', '#9d174d'),
        'adjustment':   ('#f1f5f9', '#334155'),
    }

    def movement_badge(self, obj):
        bg, fg = self.BADGE_COLORS.get(obj.movement_type, ('#f1f5f9', '#334155'))
        return format_html(
            '<span style="background:{};color:{};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600">{}</span>',
            bg, fg, obj.get_movement_type_display(),
        )
    movement_badge.short_description = 'Movement'

    def has_add_permission(self, request):
        return False  # Logs are written via create_movement() only

    def has_delete_permission(self, request, obj=None):
        return False  # Logs are immutable

    def has_change_permission(self, request, obj=None):
        return False  # Logs are immutable
