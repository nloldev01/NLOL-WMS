from django.db import models, transaction
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.utils import timezone

User = get_user_model()


class PackagingOrder(models.Model):
    STATUS_CHOICES = [
        ('draft',       'Draft'),
        ('in_progress', 'In Progress'),
        ('completed',   'Completed'),
        ('cancelled',   'Cancelled'),
    ]

    order_number = models.CharField(max_length=50, unique=True)

    # Link to the assembly order that filled this batch (primary path)
    assembly_order = models.ForeignKey(
        'assembly.AssemblyOrder',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='packaging_orders',
    )

    # Variant and location — can be derived from assembly_order when linked
    finished_product_variant = models.ForeignKey(
        'master_data.FinishedProductVariant',
        null=True, blank=True,
        on_delete=models.PROTECT,
        related_name='packaging_orders',
    )
    destination_location = models.ForeignKey(
        'master_data.Location',
        null=True, blank=True,
        on_delete=models.PROTECT,
        related_name='packaging_dest_orders',
    )

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    sticker_confirmed = models.BooleanField(default=False)
    produced_batch = models.ForeignKey(
        'inventory_core.Batch',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='packaging_orders',
    )
    produced_lpn = models.ForeignKey(
        'inventory_core.LPN',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='packaging_orders',
    )
    operator_notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'packaging_orders'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.order_number} ({self.get_status_display()})"

    @classmethod
    def generate_order_number(cls):
        today = timezone.localdate()
        date_str = today.strftime("%Y%m%d")
        prefix = f"PKG-{date_str}-"
        last = (
            cls.objects
            .filter(order_number__startswith=prefix)
            .order_by('-order_number')
            .values_list('order_number', flat=True)
            .first()
        )
        seq = int(last.split('-')[-1]) + 1 if last else 1
        return f"{prefix}{seq:04d}"

    @transaction.atomic
    @transaction.atomic
    def label(self, performed_by=None):
        """Label step: confirm sticker, print LPN, mark completed."""
        if self.status != 'in_progress':
            raise ValidationError("Only in-progress packaging orders can be labeled.")

        # Resolve batch and variant (from assembly_order if linked, or direct fields)
        produced_batch = self.produced_batch
        if not produced_batch and self.assembly_order:
            produced_batch = self.assembly_order.produced_batch
        if not produced_batch:
            raise ValidationError("No batch to label. Link an assembly order or set produced_batch.")

        variant = self.finished_product_variant
        if not variant and self.assembly_order:
            variant = self.assembly_order.finished_product_variant

        location = self.destination_location
        if not location and self.assembly_order:
            location = self.assembly_order.destination_location

        if not location:
            raise ValidationError(
                "Cannot label: no destination location found. "
                "Ensure the linked assembly order has a destination location set."
            )
        if not variant:
            raise ValidationError(
                "Cannot label: no finished product variant found. "
                "Ensure the linked assembly order has a variant set."
            )

        if variant.added_sticker and not self.sticker_confirmed:
            raise ValidationError(
                f"Sticker '{variant.sticker_name or 'required'}' must be confirmed before labeling."
            )

        from inventory_core.models import LPN
        from inventory_core.services.batch_service import BatchService
        from products_stock.models import FinishedProductStock, FinishedProductStockLog

        # Reuse existing LPN (created during assembly completion) — don't create a duplicate
        new_lpn = LPN.objects.filter(batch_id=produced_batch.pk).first()
        if not new_lpn:
            # Fallback: assembly skipped LPN generation — create one now
            lpn_code = BatchService.generate_lpn_code(produced_batch)
            new_lpn = LPN.objects.create(lpn_code=lpn_code, batch=produced_batch)

        # Ensure stock entry has the LPN stamped (use .pk to avoid FK object identity issues)
        FinishedProductStock.objects.filter(
            batch_id=produced_batch.pk,
            lpn=None,
        ).update(lpn=new_lpn)

        # Ensure log entry has the LPN stamped
        FinishedProductStockLog.objects.filter(
            batch_id=produced_batch.pk,
            movement_type='packaging_production',
            lpn=None,
        ).update(lpn=new_lpn)

        self.produced_batch = produced_batch
        self.produced_lpn = new_lpn
        self.status = 'completed'
        self.save()

        # Mark the linked assembly order as fully completed after labeling
        if self.assembly_order and self.assembly_order.status == 'assembled':
            self.assembly_order.status = 'completed'
            self.assembly_order.save(update_fields=['status'])

        qty = str(self.assembly_order.actual_quantity) if self.assembly_order else '0'
        return {
            'batch_code':    produced_batch.batch_code,
            'lpn_code':      new_lpn.lpn_code,
            'lpn':           new_lpn.id,
            'batch':         produced_batch.id,
            'finished_product_name':          variant.finished_product.name if variant else '',
            'finished_product_variant_label': str(variant) if variant else '',
            'quantity':      qty,
            'unit':          variant.unit.symbol if variant else '',
            'unit_name':     variant.unit.name if variant else '',
            'volume_unit_symbol': variant.volume_unit.symbol if variant else '',
            'location_name': location.name if location else '',
            'created_at':    self.updated_at.isoformat() if self.updated_at else None,
        'assembly_order_number': self.assembly_order.assembly_number if self.assembly_order else None,
        }
