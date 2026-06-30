import uuid
from django.db import models, transaction
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.utils import timezone

User = get_user_model()


class VariantPackagingMaterial(models.Model):
    """BOM line: defines how much of a consumable is needed per unit of a finished product variant."""
    finished_product_variant = models.ForeignKey(
        'master_data.FinishedProductVariant',
        on_delete=models.CASCADE,
        related_name='packaging_materials',
    )
    material = models.ForeignKey(
        'master_data.RawMaterialAndConsumable',
        on_delete=models.PROTECT,
        related_name='variant_bom_lines',
    )
    quantity_per_unit = models.DecimalField(max_digits=14, decimal_places=4)

    class Meta:
        db_table = 'assembly_variant_packaging_materials'
        unique_together = ('finished_product_variant', 'material')
        ordering = ['material__name']

    def __str__(self):
        return f"{self.material.name} × {self.quantity_per_unit} per {self.finished_product_variant}"


class AssemblyOrder(models.Model):
    STATUS_CHOICES = [
        ('draft',       'Draft'),
        ('in_progress', 'In Progress'),
        ('assembled',   'Assembled'),
        ('completed',   'Completed'),
        ('cancelled',   'Cancelled'),
    ]

    assembly_number = models.CharField(max_length=50, unique=True)
    assembly_line = models.ForeignKey(
        'master_data.Location',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='assembly_line_orders',
        limit_choices_to={'type': 'assembly'},
    )
    packaging_order = models.ForeignKey(
        'packaging.PackagingOrder',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='assembly_orders',
    )
    finished_product_variant = models.ForeignKey(
        'master_data.FinishedProductVariant',
        on_delete=models.PROTECT,
        related_name='assembly_orders',
    )
    source_location = models.ForeignKey(
        'master_data.Location',
        on_delete=models.PROTECT,
        related_name='assembly_source_orders',
    )
    source_batch = models.ForeignKey(
        'inventory_core.Batch',
        null=True, blank=True,
        on_delete=models.PROTECT,
        related_name='assembly_source',
    )
    destination_location = models.ForeignKey(
        'master_data.Location',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='assembly_dest_orders',
    )
    produced_batch = models.ForeignKey(
        'inventory_core.Batch',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='assembly_produced',
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    target_quantity = models.DecimalField(max_digits=14, decimal_places=4)
    actual_quantity = models.DecimalField(max_digits=14, decimal_places=4, null=True, blank=True)
    notes = models.TextField(blank=True, null=True)
    performed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='assembly_orders')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'assembly_orders'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.assembly_number} ({self.get_status_display()})"

    def clean(self):
        if self.assembly_line_id and self.finished_product_variant_id:
            running = AssemblyOrder.objects.filter(
                assembly_line=self.assembly_line_id,
                status='in_progress',
            ).exclude(pk=self.pk)
            my_product_id = self.finished_product_variant.finished_product_id
            conflicting = running.exclude(
                finished_product_variant__finished_product_id=my_product_id
            ).values_list('finished_product_variant__finished_product__name', flat=True).first()
            if conflicting:
                raise ValidationError(
                    f"This assembly line is already running '{conflicting}'. "
                    f"Complete or cancel existing orders before starting a different product."
                )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    @classmethod
    def generate_order_number(cls):
        today = timezone.localdate()
        date_str = today.strftime("%Y%m%d")
        prefix = f"ASM-{date_str}-"
        last = (
            cls.objects
            .filter(assembly_number__startswith=prefix)
            .order_by('-assembly_number')
            .values_list('assembly_number', flat=True)
            .first()
        )
        seq = int(last.split('-')[-1]) + 1 if last else 1
        return f"{prefix}{seq:04d}"

    @transaction.atomic
    def complete(self, actual_quantity, destination_location=None, performed_by=None):
        if self.status != 'in_progress':
            raise ValidationError("Only in-progress assembly orders can be completed.")

        from inventory_core.models import Batch
        from inventory_core.services.batch_service import BatchService
        from products_stock.models import ProductStockLog, FinishedProductStockLog

        if actual_quantity > self.target_quantity:
            raise ValidationError(
                f"Actual quantity ({actual_quantity}) cannot exceed the target quantity ({self.target_quantity})."
            )

        variant = self.finished_product_variant
        # Destination = assembly zone (parent of the assembly line), not the line itself
        _zone = None
        if self.assembly_line and self.assembly_line.parent_id:
            _zone = self.assembly_line.parent
        elif self.assembly_line:
            _zone = self.assembly_line
        dest = destination_location or self.destination_location or _zone

        if not dest:
            raise ValidationError(
                "Cannot complete assembly: no assembly line set on this order."
            )

        # 1. Deduct base product stock (best-effort — non-blocking, but visible on failure)
        base_qty = actual_quantity * variant.base_quantity
        base_deducted = False
        base_deduct_note = ''

        if base_qty <= 0:
            base_deduct_note = f"Skipped: base_quantity is {variant.base_quantity} (variant not configured)"
        else:
            try:
                from products_stock.models import ProductStock as _PS
                _stock = (
                    _PS.objects.filter(
                        product=variant.finished_product.base_product,
                        location=self.source_location,
                        batch=self.source_batch,
                    ).first()
                    or _PS.objects.filter(
                        product=variant.finished_product.base_product,
                        location=self.source_location,
                    ).first()
                )
                if not _stock:
                    base_deduct_note = "Skipped: no base product stock found at source location"
                elif _stock.quantity < base_qty:
                    base_deduct_note = f"Skipped: only {float(_stock.quantity)} available, {float(base_qty)} needed"
                else:
                    ProductStockLog.create_movement(
                        product=_stock.product,
                        location=_stock.location,
                        movement_type='packaging_usage',
                        quantity=base_qty,
                        batch=_stock.batch,
                        lpn=_stock.lpn,
                        reference=self.assembly_number,
                        notes=f"Used in assembly {self.assembly_number}",
                        performed_by=performed_by,
                    )
                    base_deducted = True
            except Exception as e:
                base_deduct_note = str(e)

        # 2. Create FIN batch
        batch_code = BatchService.generate_code('FIN')
        new_batch = Batch.objects.create(
            batch_code=batch_code,
            batch_type='FIN',
            finished_product_variant=variant,
        )

        # 3. Add finished product stock with LPN generated immediately
        FinishedProductStockLog.create_movement(
            finished_product_variant=variant,
            location=dest,
            movement_type='packaging_production',
            quantity=actual_quantity,
            batch=new_batch,
            auto_generate_lpn=True,
            reference=self.assembly_number,
            notes=f"Assembled in {self.assembly_number}",
            performed_by=performed_by,
        )

        # 3b. Backfill any labels printed before assembly (batch/LPN didn't exist yet)
        #     so their IDENTITY/REDEEM QR codes resolve to the real produced batch.
        from inventory_core.models import LPN
        new_lpn = LPN.objects.filter(batch=new_batch).order_by('-created_at').first()
        self.print_jobs.filter(batch__isnull=True).update(batch=new_batch, lpn=new_lpn)

        # 4. Reconcile linked consumable requests. Any request dispatched against this
        #    order is auto-consumed in full on completion (record_return with no
        #    overrides defaults to "everything dispatched was used"). For a partial
        #    return, record it manually via the Consumables page's "Record Return"
        #    step before completing — that moves the request out of 'dispatched', so
        #    it won't be touched here. This no longer depends on a Packaging BOM ratio,
        #    since consumables can now be requested freely.
        from consumables.models import ConsumableRequest
        deductions = []
        linked = list(
            ConsumableRequest.objects
            .filter(assembly_reference=self.assembly_number, status='dispatched')
            .prefetch_related('items__material__unit')
        )
        for req in linked:
            try:
                req.record_return(performed_by=performed_by)
                for item in req.items.select_related('material', 'material__unit').all():
                    deductions.append({
                        'material_name': item.material.name,
                        'unit_symbol':   item.material.unit.symbol if item.material.unit else '',
                        'quantity_used': float(item.used_quantity or 0),
                        'deducted':      True,
                        'via':           f"Consumable request {req.request_number}",
                    })
            except Exception:
                pass  # best-effort, non-blocking

        if not linked:
            # Nothing was dispatched. If the BOM suggests a requirement, surface it
            # as a warning instead of silently deducting.
            from math import ceil as _ceil
            for b in variant.packaging_materials.select_related('material', 'material__unit').all():
                if b.material.type != 'consumable':
                    continue
                deductions.append({
                    'material_name': b.material.name,
                    'unit_symbol':   b.material.unit.symbol if b.material.unit else '',
                    'quantity_used': float(int(_ceil(b.quantity_per_unit * actual_quantity))),
                    'deducted':      False,
                    'via':           'No dispatched consumable request — not deducted',
                })

        self.produced_batch = new_batch
        self.actual_quantity = actual_quantity
        self.destination_location = dest  # persist chosen destination for the packaging label step
        self.status = 'assembled'
        self.performed_by = performed_by
        self.save()
        return deductions, base_deducted, base_deduct_note


class LabelPrintJob(models.Model):
    assembly_order = models.ForeignKey(AssemblyOrder, on_delete=models.CASCADE, related_name='print_jobs')
    lpn            = models.ForeignKey('inventory_core.LPN', on_delete=models.SET_NULL, null=True, blank=True)
    batch          = models.ForeignKey('inventory_core.Batch', on_delete=models.SET_NULL, null=True, blank=True)
    quantity       = models.PositiveIntegerField()
    redeem_code    = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    printed_by     = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    created_at     = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'assembly_label_print_jobs'
        ordering = ['-created_at']

    def __str__(self):
        return f"PrintJob #{self.pk} — {self.assembly_order.assembly_number} × {self.quantity}"
