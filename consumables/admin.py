from django.contrib import admin

from .models import ConsumableRequest, ConsumableRequestItem


class ConsumableRequestItemInline(admin.TabularInline):
    model = ConsumableRequestItem
    extra = 0


@admin.register(ConsumableRequest)
class ConsumableRequestAdmin(admin.ModelAdmin):
    list_display  = ('request_number', 'status', 'source_location', 'destination_location', 'created_at')
    list_filter   = ('status',)
    search_fields = ('request_number', 'assembly_reference')
    inlines       = [ConsumableRequestItemInline]
