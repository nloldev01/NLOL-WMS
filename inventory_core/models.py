from django.db import models
from django.utils import timezone


class BatchCounter(models.Model):
    """
    Keeps track of batch sequence per day + type.
    This ensures A00 → A99 → B00 progression.
    """
    date = models.DateField()
    batch_type = models.CharField(max_length=10)  # RAW / PRD
    letter = models.CharField(max_length=1, default='A')
    number = models.PositiveIntegerField(default=0)

    class Meta:
        unique_together = ('date', 'batch_type', 'letter')


class Batch(models.Model):
    """
    Universal batch system for BOTH raw materials and finished products.
    This is the ONLY batch table you should reference everywhere.
    """

    BATCH_TYPE_CHOICES = [
        ('RAW', 'Raw Material'),
        ('PRD', 'Product'),
        ('FIN', 'Finished Product'),
    ]

    batch_code = models.CharField(max_length=50, unique=True)

    batch_type = models.CharField(max_length=10, choices=BATCH_TYPE_CHOICES)

    # Optional links (one or both can be null depending on usage)
    raw_material = models.ForeignKey(
        'master_data.RawMaterialAndConsumable',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='batches'
    )

    product = models.ForeignKey(
        'master_data.Product',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='batches'
    )

    finished_product = models.ForeignKey(
        'master_data.FinishedProduct',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='batches'
    )

    finished_product_variant = models.ForeignKey(
        'master_data.FinishedProductVariant',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='batches'
    )

    supplier = models.ForeignKey(
        'master_data.Supplier',
        null=True,
        blank=True,
        on_delete=models.PROTECT
    )

    created_at = models.DateTimeField(auto_now_add=True)

    expiry_date = models.DateField(null=True, blank=True)

    class Meta:
        db_table = 'inventory_batches'

    def __str__(self):
        return self.batch_code


class LPN(models.Model):
    """
    License Plate Number: A physical container/pallet/split roll holding a specific batch.
    """
    lpn_code = models.CharField(max_length=50, unique=True)
    batch = models.ForeignKey(Batch, on_delete=models.PROTECT, related_name='lpns')
    
    # Track splits from a parent LPN
    parent_lpn = models.ForeignKey(
        'self', 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='child_lpns'
    )
    
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'inventory_lpns'
        verbose_name_plural = 'LPNs'

    def __str__(self):
        return f"{self.lpn_code} ({self.batch.batch_code})"


class LPNCounter(models.Model):
    """
    Tracks a purely sequential, global LPN numerical suffix.
    """
    prefix = models.CharField(max_length=2, default='L')
    last_value = models.PositiveIntegerField(default=0)

    class Meta:
        db_table = 'inventory_lpn_counter'
