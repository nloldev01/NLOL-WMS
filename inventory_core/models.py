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