from django.db import models
from django.contrib.auth import get_user_model
from django.utils import timezone

User = get_user_model()


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
        ('RAW', 'Raw Materials'),
        ('PRD', 'Production Goods'),
        ('FIN', 'Finished Goods'),
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

    QUALITY_STATUS_CHOICES = [
        ('not_required', 'Not Required'),
        ('pending', 'Pending Test'),
        ('passed', 'Passed'),
        ('failed', 'Failed'),
        ('rejected', 'Rejected'),
    ]
    quality_status = models.CharField(
        max_length=20,
        choices=QUALITY_STATUS_CHOICES,
        default='not_required',
        help_text="First Fill Test gate for PRD batches before they can be picked into Assembly.",
    )

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


# ── Pallet ────────────────────────────────────────────────────────────────────

class Pallet(models.Model):
    """
    Universal grouping of batches under a single scannable QR code.
    Pallets are reference/grouping shortcuts, NOT authoritative stock records.
    Any movement (dispatch, transfer in/out, etc.) can scan a pallet QR to
    bulk-load all associated items. Each operation then picks the batch types
    it needs (e.g. dispatch only uses FIN batches).
    """
    pallet_code = models.CharField(max_length=50, unique=True)
    notes       = models.TextField(blank=True)
    is_sealed   = models.BooleanField(default=False)
    created_by  = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='pallets')
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'inventory_pallets'
        ordering = ['-created_at']

    def __str__(self):
        return self.pallet_code

    @classmethod
    def generate_pallet_code(cls):
        today    = timezone.localdate()
        date_str = today.strftime("%Y%m%d")
        prefix   = f"PAL-{date_str}-"
        last     = (
            cls.objects
            .filter(pallet_code__startswith=prefix)
            .order_by('-pallet_code')
            .values_list('pallet_code', flat=True)
            .first()
        )
        seq = int(last.split('-')[-1]) + 1 if last else 1
        return f"{prefix}{seq:04d}"


class PalletItem(models.Model):
    """
    One LPN + quantity on a pallet.
    LPN is the source of truth for physical location; batch is derived via lpn.batch.
    """
    pallet   = models.ForeignKey(Pallet, on_delete=models.CASCADE, related_name='items')
    lpn      = models.ForeignKey(LPN, on_delete=models.PROTECT, related_name='pallet_items')
    quantity = models.DecimalField(max_digits=14, decimal_places=4)

    class Meta:
        db_table        = 'inventory_pallet_items'
        unique_together = [('pallet', 'lpn')]

    def __str__(self):
        return f"{self.pallet.pallet_code} — {self.lpn.lpn_code} x{self.quantity}"
