from django.db import models, transaction
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError

from master_data.models import Product, Location
from inventory_core.models import Batch

User = get_user_model()

class ProductStock(models.Model):
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='stock_levels')
    batch = models.ForeignKey(Batch, on_delete=models.PROTECT, null=True, blank=True, related_name='product_stock_levels')
    location = models.ForeignKey(Location, on_delete=models.PROTECT)

    quantity = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'product_stock'
        unique_together = ('product', 'batch', 'location')
        verbose_name_plural = 'Product Stocks'

    def __str__(self):
        return f"{self.product.name} @ {self.location.name} (Batch: {self.batch.batch_code if self.batch else 'None'})"

class ProductStockLog(models.Model):

    MOVEMENT_CHOICES = [
        ('production',    'Production'),
        ('sale',          'Sale / Issue'),
        ('sale_return',   'Customer Return'),
        ('purchase',      'Purchase / Receipt'),
        ('purchase_return', 'Return to Supplier'),
        ('transfer_in',   'Transfer In'),
        ('transfer_out',  'Transfer Out'),
        ('adjustment',    'Adjustment'),
        ('wastage',       'Wastage'),
    ]

    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='movement_logs')
    batch = models.ForeignKey(Batch, on_delete=models.PROTECT, null=True, blank=True)
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
    INBOUND_TYPES = {'production', 'sale_return', 'purchase', 'transfer_in', 'adjustment'}
    OUTBOUND_TYPES = {'sale', 'purchase_return', 'transfer_out', 'wastage'}

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
        supplier=None,
        performed_by=None,
        reference='',
        notes='',
        counterpart_location=None,
    ):
        if quantity <= 0:
            raise ValidationError("Quantity must be positive.")

        # Determine if this movement INCREASES or DECREASES stock
        # For transfers, we'll handle the logic recursively or explicitly
        is_inbound = movement_type in cls.INBOUND_TYPES

        # Get or create current stock record with lock
        stock, _ = ProductStock.objects.select_for_update().get_or_create(
            product=product,
            location=location,
            batch=batch,
            defaults={'quantity': 0}
        )

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
            supplier=supplier,
            movement_type=movement_type,
            quantity=quantity,
            balance_after=new_balance,
            performed_by=performed_by,
            reference=reference,
            notes=notes,
            counterpart_location=counterpart_location,
        )

        # Handle transfers - automatically create the 'In' movement if this is a 'Transfer Out'
        if movement_type == 'transfer_out':
            if not counterpart_location:
                raise ValidationError("Counterpart location required for transfers.")
            
            cls.create_movement(
                product=product,
                location=counterpart_location,
                movement_type='transfer_in',
                quantity=quantity,
                batch=batch,
                performed_by=performed_by,
                reference=reference,
                notes=notes,
                counterpart_location=location,
            )

        return log