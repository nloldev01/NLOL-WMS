from django.contrib import admin
from django.utils.html import format_html
from .models import RawMaterialStock, RawMaterialStockLog


@admin.register(RawMaterialStock)
class RawMaterialStockAdmin(admin.ModelAdmin):
    list_display    = ('raw_material', 'location', 'quantity', 'unit_display', 'updated_at')
    list_filter     = ('location', 'material__type')
    search_fields   = ('material__name', 'location__name')
    readonly_fields = ('material', 'quantity', 'updated_at')

    fieldsets = (
        (None, {
            'fields': ('material', 'location', 'quantity', 'updated_at'),
        }),
    )

    # Rename "material" → "Raw Material" in the detail form label
    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        if 'material' in form.base_fields:
            form.base_fields['material'].label = 'Raw Material'
        return form

    @admin.display(description='Raw Material', ordering='material__name')
    def raw_material(self, obj):
        return obj.material.name if obj.material else '—'

    @admin.display(description='Unit')
    def unit_display(self, obj):
        return str(obj.material.unit) if obj.material and obj.material.unit else '—'

    def has_add_permission(self, request):
        return False  # Stock rows are created automatically via create_movement()

    def has_delete_permission(self, request, obj=None):
        return False  # Never delete stock rows


@admin.register(RawMaterialStockLog)
class RawMaterialStockLogAdmin(admin.ModelAdmin):
    list_display = (
        'created_at', 'raw_material', 'movement_badge', 'signed_quantity',
        'balance_after', 'location', 'counterpart_location',
        'reference', 'performed_by',
    )
    list_filter   = ('movement_type', 'location', 'material__type', 'created_at')
    search_fields = ('material__name', 'reference', 'notes', 'performed_by__username')
    readonly_fields = (
        'material', 'location', 'counterpart_location', 'movement_type',
        'quantity', 'balance_after', 'reference', 'notes',
        'performed_by', 'created_at',
    )
    date_hierarchy = 'created_at'

    fieldsets = (
        ('Movement Info', {
            'fields': ('material', 'movement_type', 'quantity', 'balance_after'),
        }),
        ('Locations', {
            'fields': ('location', 'counterpart_location'),
        }),
        ('Reference & Notes', {
            'fields': ('reference', 'notes'),
        }),
        ('Meta', {
            'fields': ('performed_by', 'created_at'),
        }),
    )

    # Rename "material" → "Raw Material" in the detail form label
    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        if 'material' in form.base_fields:
            form.base_fields['material'].label = 'Raw Material'
        return form

    BADGE_COLORS = {
        'purchase':     ('#d1fae5', '#065f46'),
        'return':       ('#dbeafe', '#1e40af'),
        'transfer_in':  ('#ede9fe', '#5b21b6'),
        'usage':        ('#fef3c7', '#92400e'),
        'wastage':      ('#fee2e2', '#991b1b'),
        'transfer_out': ('#fce7f3', '#9d174d'),
        'adjustment':   ('#f1f5f9', '#334155'),
    }

    OUTBOUND = {'usage', 'wastage', 'transfer_out'}

    @admin.display(description='Raw Material', ordering='material__name')
    def raw_material(self, obj):
        return obj.material.name if obj.material else '—'

    @admin.display(description='Movement')
    def movement_badge(self, obj):
        bg, fg = self.BADGE_COLORS.get(obj.movement_type, ('#f1f5f9', '#334155'))
        return format_html(
            '<span style="background:{};color:{};padding:2px 8px;'
            'border-radius:4px;font-size:11px;font-weight:600">{}</span>',
            bg, fg, obj.get_movement_type_display(),
        )

    @admin.display(description='Quantity')
    def signed_quantity(self, obj):
        """Shows − for outbound (red), + for inbound (green) with unit."""
        is_out = obj.movement_type in self.OUTBOUND
        sign   = '−' if is_out else '+'
        color  = '#dc2626' if is_out else '#16a34a'
        unit   = str(obj.material.unit) if obj.material and obj.material.unit else ''
        return format_html(
            '<span style="color:{};font-weight:600">{}{} {}</span>',
            color, sign, obj.quantity, unit,
        )

    def has_add_permission(self, request):
        return False  # Logs are written via create_movement() only

    def has_delete_permission(self, request, obj=None):
        return False  # Logs are immutable

    def has_change_permission(self, request, obj=None):
        return False  # Logs are immutable