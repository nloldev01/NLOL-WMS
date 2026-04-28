from django.contrib import admin
from .models import Batch, LPN, BatchCounter

@admin.register(Batch)
class BatchAdmin(admin.ModelAdmin):
    list_display = ('batch_code', 'batch_type', 'created_at')
    search_fields = ('batch_code',)
    list_filter = ('batch_type',)

@admin.register(LPN)
class LPNAdmin(admin.ModelAdmin):
    list_display = ('lpn_code', 'batch', 'is_active', 'created_at')
    search_fields = ('lpn_code', 'batch__batch_code')
    list_filter = ('is_active',)

admin.site.register(BatchCounter)
