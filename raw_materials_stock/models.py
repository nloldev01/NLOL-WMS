from django.db import models
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import transaction

User = get_user_model()


class RawMaterialStock(models.Model):
    """
    Current stock level per material per location.
    This is a fast-read snapshot — always updated alongside a log entry.
    Never edit this directly; go through RawMaterialStockLog.create_movement().
    """

    material = models.ForeignKey(
        'master_data.RawMaterialAndConsumable',
        on_delete=models.PROTECT,
        related_name='stock_entries',
    )
    location = models.ForeignKey(
        'Location',
        on_delete=models.PROTECT,
        related_name='stock_entries',
    )
    quantity = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'raw_material_stock'
        unique_together = ('material', 'location')
        ordering = ['material__name', 'location__name']

    def __str__(self):
        return f"{self.material.name} @ {self.location.name}: {self.quantity} {self.material.unit}"


class RawMaterialStockLog(models.Model):
    """
    Immutable ledger of every stock movement.
    This is the source of truth — never delete or edit rows here.
    Use create_movement() to record any change.
    """

    MOVEMENT_CHOICES = [
        # Inbound
        ('purchase',     'Purchase / Receipt'),
        ('return',       'Return from Production'),
        ('transfer_in',  'Transfer In'),
        # Outbound
        ('usage',        'Usage in Production'),
        ('wastage',      'Wastage / Damage'),
        ('transfer_out', 'Transfer Out'),
        # Neutral
        ('adjustment',   'Stock Adjustment'),
    ]

    # What moved
    material = models.ForeignKey(
        'master_data.RawMaterialAndConsumable',
        on_delete=models.PROTECT,
        related_name='stock_logs',
    )

    # Where it moved (from/to)
    location = models.ForeignKey(
        'Location',
        on_delete=models.PROTECT,
        related_name='stock_logs',
        help_text="Primary location affected by this movement.",
    )
    # Populated only for transfers — the counterpart location
    counterpart_location = models.ForeignKey(
        'Location',
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name='counterpart_stock_logs',
        help_text="Destination (for transfer_out) or source (for transfer_in).",
    )

    # The movement itself
    movement_type = models.CharField(max_length=20, choices=MOVEMENT_CHOICES)
    # Always store as a positive number; direction is inferred from movement_type
    quantity = models.DecimalField(max_digits=14, decimal_places=4)
    # Snapshot of stock at this location AFTER this movement
    balance_after = models.DecimalField(max_digits=14, decimal_places=4)

    # Optional context
    unit_cost = models.DecimalField(
        max_digits=14, decimal_places=4,
        null=True, blank=True,
        help_text="Cost per unit at time of movement (for purchase/usage costing).",
    )
    reference = models.CharField(
        max_length=255, blank=True,
        help_text="PO number, production order ID, transfer slip, etc.",
    )
    notes = models.TextField(blank=True)

    # Who / when
    performed_by = models.ForeignKey(
        User,
        null=True,
        on_delete=models.SET_NULL,
        related_name='stock_log_entries',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'raw_material_stock_log'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['material', 'location', '-created_at']),
            models.Index(fields=['movement_type']),
            models.Index(fields=['reference']),
        ]

    def __str__(self):
        return (
            f"[{self.get_movement_type_display()}] "
            f"{self.material.name} x{self.quantity} "
            f"@ {self.location.name} ({self.created_at:%Y-%m-%d %H:%M})"
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    INBOUND_TYPES = {'purchase', 'return', 'transfer_in', 'adjustment'}
    OUTBOUND_TYPES = {'usage', 'wastage', 'transfer_out'}

    @property
    def is_inbound(self):
        return self.movement_type in self.INBOUND_TYPES

    @property
    def signed_quantity(self):
        """Positive for inbound, negative for outbound."""
        return self.quantity if self.is_inbound else -self.quantity

    # ------------------------------------------------------------------
    # Main entry point — always use this instead of saving directly
    # ------------------------------------------------------------------

    @classmethod
    @transaction.atomic
    def create_movement(
        cls,
        *,
        material,
        location,
        movement_type,
        quantity,
        performed_by=None,
        reference='',
        notes='',
        unit_cost=None,
        counterpart_location=None,
    ):
        """
        Record a stock movement and update the RawMaterialStock snapshot.

        For transfers, call this once with movement_type='transfer_out' and
        supply counterpart_location. The method will automatically create the
        paired 'transfer_in' log entry and update both location snapshots.

        Raises ValidationError if the movement would drive stock negative
        (for outbound movements).
        """
        if quantity <= 0:
            raise ValidationError("Quantity must be positive.")

        # Determine sign
        is_inbound = movement_type in cls.INBOUND_TYPES

        # Lock the stock row to prevent race conditions
        stock, _ = RawMaterialStock.objects.select_for_update().get_or_create(
            material=material,
            location=location,
            defaults={'quantity': 0},
        )

        new_balance = stock.quantity + quantity if is_inbound else stock.quantity - quantity

        if new_balance < 0:
            raise ValidationError(
                f"Insufficient stock: {stock.quantity} available, "
                f"{quantity} requested at {location}."
            )

        # Update snapshot
        stock.quantity = new_balance
        stock.save()

        # Write the log entry
        log = cls.objects.create(
            material=material,
            location=location,
            movement_type=movement_type,
            quantity=quantity,
            balance_after=new_balance,
            unit_cost=unit_cost,
            reference=reference,
            notes=notes,
            performed_by=performed_by,
            counterpart_location=counterpart_location,
        )

        # Handle the paired leg of a transfer automatically
        if movement_type == 'transfer_out':
            if not counterpart_location:
                raise ValidationError("counterpart_location is required for transfers.")
            cls.create_movement(
                material=material,
                location=counterpart_location,
                movement_type='transfer_in',
                quantity=quantity,
                performed_by=performed_by,
                reference=reference,
                notes=notes,
                unit_cost=unit_cost,
                counterpart_location=location,
            )

        return log


class Location(models.Model):
    """
    A physical or logical place where stock can be held.
    e.g. Main Warehouse, Production Floor, Mixing Area, Cold Storage.
    """
    name = models.CharField(max_length=255, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'raw_material_locations'
        ordering = ['name']

    def __str__(self):
        return self.name
