from django.db import models, transaction
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError

from master_data.models import Product, FinishedProduct, FinishedProductVariant, Location
from inventory_core.models import Batch

User = get_user_model()

class ProductStock(models.Model):
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='stock_levels')
    batch = models.ForeignKey(Batch, on_delete=models.PROTECT, null=True, blank=True, related_name='product_stock_levels')
    lpn = models.ForeignKey(
        'inventory_core.LPN', 
        on_delete=models.PROTECT, 
        null=True, 
        blank=True, 
        related_name='product_stock_levels'
    )
    location = models.ForeignKey(Location, on_delete=models.PROTECT)

    quantity = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'product_stock'
        unique_together = ('product', 'batch', 'location', 'lpn')
        verbose_name_plural = 'Product Stocks'

    def __str__(self):
        return f"{self.product.name} @ {self.location.name} (Batch: {self.batch.batch_code if self.batch else 'None'})"

class ProductStockLog(models.Model):

    MOVEMENT_CHOICES = [
        ('production',      'Production'),
        ('packaging_usage', 'Packaging Usage'),
        ('sale',            'Sale / Issue'),
        ('sale_return',     'Customer Return'),
        ('purchase',        'Purchase / Receipt'),
        ('purchase_return', 'Return to Supplier'),
        ('transfer_in',     'Transfer In'),
        ('transfer_out',    'Transfer Out'),
        ('adjustment',      'Adjustment (Out)'),
        ('adjustment_in',   'Adjustment (In)'),
        ('wastage',         'Wastage'),
        ('refill_recovery', 'Refill Recovery (Unpack)'),
    ]

    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='movement_logs')
    batch = models.ForeignKey(Batch, on_delete=models.PROTECT, null=True, blank=True)
    lpn = models.ForeignKey('inventory_core.LPN', on_delete=models.PROTECT, null=True, blank=True)
    supplier = models.ForeignKey('master_data.Supplier', on_delete=models.PROTECT, null=True, blank=True, related_name='product_stock_logs')
    location = models.ForeignKey(Location, on_delete=models.PROTECT)

    counterpart_location = models.ForeignKey(
        Location,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='product_counterpart_logs'
    )

    movement_type = models.CharField(max_length=20, choices=MOVEMENT_CHOICES)
    quantity = models.DecimalField(max_digits=14, decimal_places=4)
    balance_after = models.DecimalField(max_digits=14, decimal_places=4)

    reference = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)

    performed_by = models.ForeignKey(
        User,
        null=True,
        on_delete=models.SET_NULL
    )

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'product_stock_logs'
        ordering = ['-created_at']

    # -------------------------------
    # Inbound vs Outbound logic
    # -------------------------------
    INBOUND_TYPES = {'production', 'sale_return', 'purchase', 'transfer_in', 'adjustment_in', 'refill_recovery'}
    OUTBOUND_TYPES = {'sale', 'purchase_return', 'transfer_out', 'wastage', 'adjustment', 'packaging_usage'}

    @classmethod
    @transaction.atomic
    def create_movement(
        cls,
        *,
        product,
        location,
        movement_type,
        quantity,
        batch=None,
        lpn=None,
        supplier=None,
        performed_by=None,
        reference='',
        notes='',
        counterpart_location=None,
        auto_generate_lpn=False,
        _internal=False, # New flag to prevent infinite loops
    ):
        if quantity <= 0:
            raise ValidationError("Quantity must be positive.")

        # ---- INTERCEPT MANUAL TRANSFER IN ----
        if movement_type == 'transfer_in' and not _internal:
            if not counterpart_location:
                raise ValidationError("Counterpart location (source) required for manual transfers.")
            
            return cls.create_movement(
                product=product,
                location=counterpart_location,
                movement_type='transfer_out',
                quantity=quantity,
                batch=batch,
                lpn=lpn,
                supplier=supplier,
                performed_by=performed_by,
                reference=reference,
                notes=notes,
                counterpart_location=location,
                auto_generate_lpn=auto_generate_lpn,
                _internal=False,
            )

        # Determine if this movement INCREASES or DECREASES stock
        # For transfers, we'll handle the logic recursively or explicitly
        is_inbound = movement_type in cls.INBOUND_TYPES

        # Global LPN generation logic:
        # 1. Transfers ALWAYS get a new LPN at the destination
        # 2. Other inbounds get an LPN if auto_generate_lpn is True
        if not lpn and batch:
            if movement_type == 'transfer_in' or (is_inbound and auto_generate_lpn):
                from inventory_core.services.batch_service import BatchService
                from inventory_core.models import LPN
                lpn_code = BatchService.generate_lpn_code(batch)
                lpn = LPN.objects.create(lpn_code=lpn_code, batch=batch)

        # Get or create current stock record with lock
        stock, _ = ProductStock.objects.select_for_update().get_or_create(
            product=product,
            location=location,
            batch=batch,
            lpn=lpn,
            defaults={'quantity': 0}
        )

        # Prevent mixing materials in tanks and kettles
        if is_inbound and location.type in ['tank', 'kettle']:
            if ProductStock.objects.filter(location=location, quantity__gt=0).exclude(product=product).exists():
                raise ValidationError(f"Location '{location.name}' is currently holding a different product.")
            from raw_materials_stock.models import RawMaterialStock
            if RawMaterialStock.objects.filter(location=location, quantity__gt=0).exists():
                raise ValidationError(f"Location '{location.name}' is currently holding a raw material.")

        # Calculate new balance
        if is_inbound:
            new_balance = stock.quantity + quantity
        else:
            new_balance = stock.quantity - quantity

        if new_balance < 0:
            raise ValidationError(f"Insufficient stock for {product.name} at {location.name}.")

        # Update stock
        stock.quantity = new_balance
        stock.save()

        # Create log entry
        log = cls.objects.create(
            product=product,
            location=location,
            batch=batch,
            lpn=lpn,
            supplier=supplier,
            movement_type=movement_type,
            quantity=quantity,
            balance_after=new_balance,
            performed_by=performed_by,
            reference=reference,
            notes=notes,
            counterpart_location=counterpart_location,
        )

        # Handle transfers - automatically create the paired leg
        if not _internal:
            if movement_type == 'transfer_out':
                if not counterpart_location:
                    raise ValidationError("Counterpart location required for transfers.")
                
                # We call the destination leg. It will generate its own LPN.
                return cls.create_movement(
                    product=product,
                    location=counterpart_location,
                    movement_type='transfer_in',
                    quantity=quantity,
                    batch=batch,
                    lpn=None, # Let the destination leg generate its own LPN
                    supplier=supplier,
                    performed_by=performed_by,
                    reference=reference,
                    notes=notes,
                    counterpart_location=location,
                    _internal=True,
                )
        return log


# ─────────────────────────────────────────────────────────────────────────────
# Finished Product Stock (packaged goods)
# ─────────────────────────────────────────────────────────────────────────────

class FinishedProductStock(models.Model):
    finished_product_variant = models.ForeignKey(FinishedProductVariant, null=True, blank=True, on_delete=models.PROTECT, related_name='stock_levels')
    batch = models.ForeignKey(Batch, on_delete=models.PROTECT, null=True, blank=True, related_name='finished_product_stock_levels')
    lpn = models.ForeignKey(
        'inventory_core.LPN',
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='finished_product_stock_levels'
    )
    location = models.ForeignKey(Location, on_delete=models.PROTECT, related_name='finished_product_stock_levels')
    quantity = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'finished_product_stock'
        unique_together = [('finished_product_variant', 'batch', 'location', 'lpn')]
        ordering = ['finished_product_variant__finished_product__name', 'location__name']
        verbose_name_plural = 'Finished Product Stocks'

    def __str__(self):
        return f"{self.finished_product_variant} @ {self.location.name}: {self.quantity}"


class FinishedProductStockLog(models.Model):
    MOVEMENT_CHOICES = [
        ('packaging_production', 'Packaging Production'),
        ('purchase',             'Purchase / Receipt'),
        ('purchase_return',      'Return to Supplier'),
        ('sale',                 'Sale / Issue'),
        ('sale_return',          'Customer Return'),
        ('transfer_in',          'Transfer In'),
        ('transfer_out',         'Transfer Out'),
        ('adjustment',           'Adjustment (Out)'),
        ('adjustment_in',        'Adjustment (In)'),
        ('wastage',              'Wastage'),
        ('refill_in',            'Refill / Repack In'),
        ('refill_out',           'Refill / Repack Out'),
        ('dispatch_out',         'Dispatch to Dealer'),
    ]

    INBOUND_TYPES  = {'packaging_production', 'purchase', 'sale_return', 'transfer_in', 'adjustment_in', 'refill_in'}
    OUTBOUND_TYPES = {'sale', 'purchase_return', 'transfer_out', 'adjustment', 'wastage', 'refill_out', 'dispatch_out'}

    finished_product_variant = models.ForeignKey(FinishedProductVariant, null=True, blank=True, on_delete=models.PROTECT, related_name='movement_logs')
    batch = models.ForeignKey(Batch, on_delete=models.PROTECT, null=True, blank=True, related_name='finished_product_stock_logs')
    lpn = models.ForeignKey('inventory_core.LPN', on_delete=models.PROTECT, null=True, blank=True, related_name='finished_product_stock_logs')
    supplier = models.ForeignKey(
        'master_data.Supplier',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='finished_product_stock_logs'
    )
    location = models.ForeignKey(Location, on_delete=models.PROTECT, related_name='finished_product_stock_logs')
    counterpart_location = models.ForeignKey(
        Location,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='finished_product_counterpart_logs'
    )
    movement_type = models.CharField(max_length=30, choices=MOVEMENT_CHOICES)
    quantity = models.DecimalField(max_digits=14, decimal_places=4)
    balance_after = models.DecimalField(max_digits=14, decimal_places=4)
    reference = models.CharField(max_length=255, blank=True)
    notes = models.TextField(blank=True)
    performed_by = models.ForeignKey(User, null=True, on_delete=models.SET_NULL, related_name='finished_product_stock_log_entries')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'finished_product_stock_logs'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['finished_product_variant', 'location', '-created_at']),
            models.Index(fields=['movement_type']),
            models.Index(fields=['reference']),
        ]

    def __str__(self):
        return (
            f"[{self.get_movement_type_display()}] "
            f"{self.finished_product_variant} x{self.quantity} "
            f"@ {self.location.name} ({self.created_at:%Y-%m-%d %H:%M})"
        )

    @property
    def is_inbound(self):
        return self.movement_type in self.INBOUND_TYPES

    @property
    def signed_quantity(self):
        return self.quantity if self.is_inbound else -self.quantity

    @classmethod
    @transaction.atomic
    def create_movement(
        cls,
        *,
        finished_product_variant,
        location,
        movement_type,
        quantity,
        batch=None,
        lpn=None,
        supplier=None,
        performed_by=None,
        reference='',
        notes='',
        counterpart_location=None,
        auto_generate_lpn=False,
        _internal=False,
    ):
        if quantity <= 0:
            raise ValidationError("Quantity must be positive.")

        if movement_type == 'transfer_in' and not _internal:
            if not counterpart_location:
                raise ValidationError("counterpart_location (source) is required for manual transfers.")
            return cls.create_movement(
                finished_product_variant=finished_product_variant,
                location=counterpart_location,
                movement_type='transfer_out',
                quantity=quantity,
                batch=batch,
                lpn=lpn,
                supplier=supplier,
                performed_by=performed_by,
                reference=reference,
                notes=notes,
                counterpart_location=location,
                auto_generate_lpn=auto_generate_lpn,
                _internal=False,
            )

        is_inbound = movement_type in cls.INBOUND_TYPES

        # For outbound movements with no LPN specified, find the actual stock entry
        # (stock was labeled with an LPN but user doesn't always know it)
        if not is_inbound and lpn is None and batch:
            best = (
                FinishedProductStock.objects
                .select_for_update()
                .filter(
                    finished_product_variant=finished_product_variant,
                    location=location,
                    batch=batch,
                    quantity__gt=0,
                )
                .order_by('-quantity')
                .first()
            )
            if best:
                lpn = best.lpn  # use the LPN on the actual stock entry

        if not lpn and batch:
            if movement_type == 'transfer_in' or (is_inbound and auto_generate_lpn):
                from inventory_core.services.batch_service import BatchService
                from inventory_core.models import LPN
                lpn_code = BatchService.generate_lpn_code(batch)
                lpn = LPN.objects.create(lpn_code=lpn_code, batch=batch)

        stock, _ = FinishedProductStock.objects.select_for_update().get_or_create(
            finished_product_variant=finished_product_variant,
            location=location,
            batch=batch,
            lpn=lpn,
            defaults={'quantity': 0}
        )

        # Prevent mixing different finished product variants in a tank
        if is_inbound and location.type == 'tank':
            if FinishedProductStock.objects.filter(location=location, quantity__gt=0).exclude(finished_product_variant=finished_product_variant).exists():
                raise ValidationError(f"Location '{location.name}' is currently holding a different finished product.")

        # Validate against linked asset capacity
        if is_inbound and hasattr(location, 'linked_asset') and location.linked_asset:
            asset = location.linked_asset
            if asset.capacity:
                current_total = FinishedProductStock.objects.filter(location=location).aggregate(
                    total=models.Sum('quantity')
                )['total'] or 0
                if current_total + quantity > asset.capacity:
                    raise ValidationError(
                        f"Capacity exceeded for '{location.name}'. "
                        f"Asset '{asset.name}' capacity is {asset.capacity}, "
                        f"adding {quantity} would reach {current_total + quantity}."
                    )

        new_balance = stock.quantity + quantity if is_inbound else stock.quantity - quantity

        if new_balance < 0:
            raise ValidationError(
                f"Insufficient stock: {stock.quantity} available, "
                f"{quantity} requested at {location}."
            )

        stock.quantity = new_balance
        stock.save()

        log = cls.objects.create(
            finished_product_variant=finished_product_variant,
            location=location,
            batch=batch,
            lpn=lpn,
            supplier=supplier,
            movement_type=movement_type,
            quantity=quantity,
            balance_after=new_balance,
            performed_by=performed_by,
            reference=reference,
            notes=notes,
            counterpart_location=counterpart_location,
        )

        if not _internal and movement_type == 'transfer_out':
            if not counterpart_location:
                raise ValidationError("counterpart_location is required for transfers.")
            return cls.create_movement(
                finished_product_variant=finished_product_variant,
                location=counterpart_location,
                movement_type='transfer_in',
                quantity=quantity,
                batch=batch,
                lpn=None,
                supplier=supplier,
                performed_by=performed_by,
                reference=reference,
                notes=notes,
                counterpart_location=location,
                _internal=True,
            )

        return log