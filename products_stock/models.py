from django.db import models, transaction
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError

from master_data.models import Product, ProductBatch, Location

User = get_user_model()

class ProductStock(models.Model):
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    batch = models.ForeignKey(ProductBatch, on_delete=models.PROTECT)
    location = models.ForeignKey(Location, on_delete=models.PROTECT)

    quantity = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('product', 'batch', 'location')

class ProductStockLog(models.Model):

    MOVEMENT_CHOICES = [
        ('purchase', 'Purchase'),
        ('sale', 'Sale'),
        ('sale_return', 'Customer Return'),
        ('purchase_return', 'Return to Supplier'),
        ('transfer_in', 'Transfer In'),
        ('transfer_out', 'Transfer Out'),
        ('adjustment', 'Adjustment'),
        ('wastage', 'Wastage'),
    ]

    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    batch = models.ForeignKey(ProductBatch, on_delete=models.PROTECT)
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

    # -------------------------------
    # Movement logic
    # -------------------------------

    INBOUND = {'purchase', 'sale_return', 'transfer_in', 'adjustment'}
    OUTBOUND = {'sale', 'purchase_return', 'transfer_out', 'wastage'}

    @classmethod
    @transaction.atomic
    def create_movement(
        cls,
        *,
        product,
        batch,
        location,
        movement_type,
        quantity,
        performed_by=None,
        reference='',
        notes='',
        counterpart_location=None,
    ):
        if quantity <= 0:
            raise ValidationError("Quantity must be positive.")

        is_inbound = movement_type in cls.INBOUND

        stock, _ = ProductStock.objects.select_for_update().get_or_create(
            product=product,
            batch=batch,
            location=location,
            defaults={'quantity': 0}
        )

        new_balance = (
            stock.quantity + quantity
            if is_inbound else
            stock.quantity - quantity
        )

        if new_balance < 0:
            raise ValidationError("Insufficient stock.")

        stock.quantity = new_balance
        stock.save()

        log = cls.objects.create(
            product=product,
            batch=batch,
            location=location,
            movement_type=movement_type,
            quantity=quantity,
            balance_after=new_balance,
            performed_by=performed_by,
            reference=reference,
            notes=notes,
            counterpart_location=counterpart_location,
        )
        if movement_type == 'transfer_out':
            if not counterpart_location:
                raise ValidationError("counterpart_location required.")

            cls.create_movement(
                product=product,
                batch=batch,
                location=counterpart_location,
                movement_type='transfer_in',
                quantity=quantity,
                performed_by=performed_by,
                reference=reference,
                notes=notes,
                counterpart_location=location,
            )

        return log