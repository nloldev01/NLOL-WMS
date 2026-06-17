from django.db import models, transaction
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.utils import timezone

User = get_user_model()


class RefillOrder(models.Model):
    MODE_CHOICES = [
        ('direct',                  'Direct Repack'),
        ('via_assembly',            'Via Assembly'),
        ('via_kettle_and_assembly', 'Via Kettle & Assembly'),
    ]

    STATUS_CHOICES = [
        ('draft',             'Draft'),
        ('awaiting_kettle',   'Awaiting Kettle Completion'),
        ('awaiting_assembly', 'Awaiting Assembly Completion'),
        ('completed',         'Completed'),
        ('cancelled',         'Cancelled'),
    ]

    refill_number = models.CharField(max_length=50, unique=True)
    mode          = models.CharField(max_length=30, choices=MODE_CHOICES)
    status        = models.CharField(max_length=30, choices=STATUS_CHOICES, default='draft')

    # Source
    source_variant  = models.ForeignKey(
        'master_data.FinishedProductVariant',
        on_delete=models.PROTECT,
        related_name='refill_orders_as_source',
    )
    source_batch    = models.ForeignKey(
        'inventory_core.Batch',
        on_delete=models.PROTECT,
        related_name='refill_orders_as_source',
    )
    source_location = models.ForeignKey(
        'master_data.Location',
        on_delete=models.PROTECT,
        related_name='refill_orders_source',
    )
    source_quantity = models.DecimalField(max_digits=14, decimal_places=4)

    # Destination
    destination_variant  = models.ForeignKey(
        'master_data.FinishedProductVariant',
        on_delete=models.PROTECT,
        related_name='refill_orders_as_destination',
    )
    output_quantity      = models.DecimalField(max_digits=14, decimal_places=4, null=True, blank=True)
    destination_location = models.ForeignKey(
        'master_data.Location',
        on_delete=models.PROTECT,
        related_name='refill_orders_destination',
    )

    # Where recovered PRD stock goes (must be an assembly-type location so it
    # appears in the Assembly Orders "Ready to Assemble" queue)
    assembly_location = models.ForeignKey(
        'master_data.Location',
        null=True, blank=True,
        on_delete=models.PROTECT,
        related_name='refill_orders_assembly',
        limit_choices_to={'type': 'assembly'},
    )

    # Set during start() for via_assembly / via_kettle modes
    recovery_batch = models.ForeignKey(
        'inventory_core.Batch',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='refill_orders_as_recovery',
    )

    # Linked child orders (populated by start())
    linked_production_order = models.OneToOneField(
        'production.ProductionOrder',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='refill_order',
    )
    linked_assembly_order = models.OneToOneField(
        'assembly.AssemblyOrder',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='refill_order',
    )

    notes        = models.TextField(blank=True)
    performed_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='refill_orders')
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'refill_orders'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.refill_number} ({self.get_status_display()})"

    @classmethod
    def generate_order_number(cls):
        today = timezone.localdate()
        date_str = today.strftime("%Y%m%d")
        prefix = f"RFL-{date_str}-"
        last = (
            cls.objects
            .filter(refill_number__startswith=prefix)
            .order_by('-refill_number')
            .values_list('refill_number', flat=True)
            .first()
        )
        seq = int(last.split('-')[-1]) + 1 if last else 1
        return f"{prefix}{seq:04d}"

    def _calc_output_quantity(self):
        """
        Auto-calculate output quantity when source and destination share the same base_product.
        Returns None if cross-product (caller must supply output_quantity manually).
        """
        src_base = self.source_variant.finished_product.base_product_id
        dst_base = self.destination_variant.finished_product.base_product_id
        if src_base != dst_base:
            return None
        src_base_qty = self.source_variant.base_quantity
        dst_base_qty = self.destination_variant.base_quantity
        if not dst_base_qty:
            return None
        return (self.source_quantity * src_base_qty) / dst_base_qty

    @transaction.atomic
    def start(self, performed_by=None):
        if self.status != 'draft':
            raise ValidationError("Only draft refill orders can be started.")

        # Resolve output_quantity
        if not self.output_quantity:
            auto = self._calc_output_quantity()
            if auto is None:
                raise ValidationError(
                    "output_quantity is required when source and destination variants "
                    "belong to different base products."
                )
            self.output_quantity = auto

        if self.mode == 'direct':
            self._start_direct(performed_by)
        elif self.mode == 'via_assembly':
            self._start_via_assembly(performed_by)
        elif self.mode == 'via_kettle_and_assembly':
            self._start_via_kettle_and_assembly(performed_by)
        else:
            raise ValidationError(f"Unknown refill mode: {self.mode}")

        if performed_by:
            self.performed_by = performed_by
        self.save()

    def _start_direct(self, performed_by):
        from products_stock.models import FinishedProductStockLog
        from inventory_core.models import Batch
        from inventory_core.services.batch_service import BatchService

        # Deduct source
        FinishedProductStockLog.create_movement(
            finished_product_variant=self.source_variant,
            location=self.source_location,
            movement_type='refill_out',
            quantity=self.source_quantity,
            batch=self.source_batch,
            performed_by=performed_by,
            reference=self.refill_number,
            notes=f"Refill out → {self.destination_variant}",
        )

        # Create new FIN batch for the output
        batch_code = BatchService.generate_code('FIN')
        new_batch = Batch.objects.create(
            batch_code=batch_code,
            batch_type='FIN',
            finished_product=self.destination_variant.finished_product,
            finished_product_variant=self.destination_variant,
        )

        # Credit destination
        FinishedProductStockLog.create_movement(
            finished_product_variant=self.destination_variant,
            location=self.destination_location,
            movement_type='refill_in',
            quantity=self.output_quantity,
            batch=new_batch,
            performed_by=performed_by,
            reference=self.refill_number,
            notes=f"Refill in ← {self.source_variant}",
            auto_generate_lpn=True,
        )

        self.status = 'completed'

    def _start_via_assembly(self, performed_by):
        from products_stock.models import FinishedProductStockLog, ProductStockLog
        from assembly.models import AssemblyOrder
        from inventory_core.models import Batch
        from inventory_core.services.batch_service import BatchService

        if not self.assembly_location_id:
            raise ValidationError("assembly_location is required for via_assembly mode.")

        # Deduct source finished stock
        FinishedProductStockLog.create_movement(
            finished_product_variant=self.source_variant,
            location=self.source_location,
            movement_type='refill_out',
            quantity=self.source_quantity,
            batch=self.source_batch,
            performed_by=performed_by,
            reference=self.refill_number,
        )

        # Recover intermediate product stock — credit to the assembly line so it
        # appears in the Assembly Orders "Ready to Assemble" queue
        base_product = self.source_variant.finished_product.base_product
        recovery_batch_code = BatchService.generate_code('PRD')
        recovery_batch = Batch.objects.create(
            batch_code=recovery_batch_code,
            batch_type='PRD',
            product=base_product,
        )
        recovered_qty = self.source_quantity * self.source_variant.base_quantity
        ProductStockLog.create_movement(
            product=base_product,
            location=self.assembly_location,
            movement_type='refill_recovery',
            quantity=recovered_qty,
            batch=recovery_batch,
            performed_by=performed_by,
            reference=self.refill_number,
        )

        # Create linked AssemblyOrder: source = assembly line, output = destination
        asm = AssemblyOrder.objects.create(
            assembly_number=AssemblyOrder.generate_order_number(),
            finished_product_variant=self.destination_variant,
            source_location=self.assembly_location,
            source_batch=recovery_batch,
            destination_location=self.destination_location,
            target_quantity=self.output_quantity,
            notes=f"Created by refill order {self.refill_number}",
            performed_by=performed_by,
        )

        self.recovery_batch = recovery_batch
        self.linked_assembly_order = asm
        self.status = 'awaiting_assembly'

    def _start_via_kettle_and_assembly(self, performed_by):
        from products_stock.models import FinishedProductStockLog, ProductStockLog
        from production.models import ProductionOrder
        from inventory_core.models import Batch
        from inventory_core.services.batch_service import BatchService

        if not self.assembly_location_id:
            raise ValidationError("assembly_location is required for via_kettle_and_assembly mode.")

        # Deduct source finished stock
        FinishedProductStockLog.create_movement(
            finished_product_variant=self.source_variant,
            location=self.source_location,
            movement_type='refill_out',
            quantity=self.source_quantity,
            batch=self.source_batch,
            performed_by=performed_by,
            reference=self.refill_number,
        )

        # Recover intermediate stock at the assembly/kettle location
        base_product = self.source_variant.finished_product.base_product
        recovery_batch_code = BatchService.generate_code('PRD')
        recovery_batch = Batch.objects.create(
            batch_code=recovery_batch_code,
            batch_type='PRD',
            product=base_product,
        )
        recovered_qty = self.source_quantity * self.source_variant.base_quantity
        ProductStockLog.create_movement(
            product=base_product,
            location=self.assembly_location,
            movement_type='refill_recovery',
            quantity=recovered_qty,
            batch=recovery_batch,
            performed_by=performed_by,
            reference=self.refill_number,
        )

        # Generate order number using same pattern as production/views.py
        prefix = timezone.now().strftime('PO-%Y%m%d')
        last = (
            ProductionOrder.objects
            .filter(order_number__startswith=prefix)
            .order_by('-order_number')
            .first()
        )
        seq = 1
        if last:
            try:
                seq = int(last.order_number.split('-')[-1]) + 1
            except ValueError:
                seq = ProductionOrder.objects.filter(order_number__startswith=prefix).count() + 1
        prod_order_number = f"{prefix}-{seq:04d}"

        # Create linked ProductionOrder — kettle = assembly_location
        prod = ProductionOrder.objects.create(
            order_number=prod_order_number,
            kettle=self.assembly_location,
            target_quantity=recovered_qty,
            operator_notes=f"Refill order {self.refill_number}: reprocess {self.source_variant} → {self.destination_variant}",
        )

        self.recovery_batch = recovery_batch
        self.linked_production_order = prod
        self.status = 'awaiting_kettle'
