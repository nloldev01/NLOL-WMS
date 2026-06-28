from decimal import Decimal

from django.db import models, transaction
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.utils import timezone

User = get_user_model()


def _draw_down(material, location, quantity, *, movement_type, counterpart_location=None,
               performed_by=None, reference='', notes=''):
    """Consume `quantity` of a material out of a location, spread across the actual
    stock rows (batch/LPN buckets) that hold it.

    Stock is tracked per (material, location, batch, lpn), so a single batch-less
    movement can't find batch-tracked stock. This walks the existing rows and emits
    one movement per row (carrying that row's batch/lpn) until the quantity is met.
    Raises ValidationError if the location doesn't hold enough in total.
    """
    from raw_materials_stock.models import RawMaterialStock, RawMaterialStockLog

    remaining = Decimal(str(quantity))
    rows = list(
        RawMaterialStock.objects
        .select_for_update()
        .filter(material=material, location=location, quantity__gt=0)
        .order_by('id')
    )
    available = sum((r.quantity for r in rows), Decimal('0'))
    if available < remaining:
        raise ValidationError(
            f"Insufficient stock: {available} available, {quantity} requested for "
            f"{material.name} at {location}."
        )

    for row in rows:
        if remaining <= 0:
            break
        take = row.quantity if row.quantity < remaining else remaining
        RawMaterialStockLog.create_movement(
            material=material,
            location=location,
            movement_type=movement_type,
            quantity=take,
            batch=row.batch,
            lpn=row.lpn,
            counterpart_location=counterpart_location,
            performed_by=performed_by,
            reference=reference,
            notes=notes,
        )
        remaining -= take


# ─────────────────────────────────────────────────────────────────────────────
# Consumable Request — standalone request → approve → dispatch → use → return
#
# Lifecycle:
#   draft → submitted → approved / rejected → dispatched → returned
#
# Stock model ("dispatch out, return unused"):
#   - On dispatch, the full approved quantity is transferred out of the source
#     location to an in-use / assembly location.
#   - On return, the used quantity is consumed (usage) and the unused remainder
#     is transferred back from the in-use location to the source location.
# All stock mutations reuse RawMaterialStockLog.create_movement().
# ─────────────────────────────────────────────────────────────────────────────


class ConsumableRequest(models.Model):
    STATUS_CHOICES = [
        ('draft',      'Draft'),
        ('submitted',  'Submitted'),
        ('approved',   'Approved'),
        ('rejected',   'Rejected'),
        ('dispatched', 'Dispatched'),
        ('returned',   'Returned'),
    ]

    request_number = models.CharField(max_length=50, unique=True)
    status         = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')

    source_location = models.ForeignKey(
        'master_data.Location', on_delete=models.PROTECT,
        related_name='consumable_requests_source',
    )
    destination_location = models.ForeignKey(
        'master_data.Location', null=True, blank=True, on_delete=models.PROTECT,
        related_name='consumable_requests_destination',
    )

    assembly_reference = models.CharField(max_length=255, blank=True)
    notes              = models.TextField(blank=True)
    rejection_reason   = models.TextField(blank=True)

    created_by    = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='created_consumable_requests')
    approved_by   = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='approved_consumable_requests')
    dispatched_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='dispatched_consumable_requests')
    returned_by   = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='returned_consumable_requests')

    created_at    = models.DateTimeField(auto_now_add=True)
    updated_at    = models.DateTimeField(auto_now=True)
    approved_at   = models.DateTimeField(null=True, blank=True)
    dispatched_at = models.DateTimeField(null=True, blank=True)
    returned_at   = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'consumable_requests'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.request_number} ({self.get_status_display()})"

    @classmethod
    def generate_request_number(cls):
        today = timezone.localdate()
        date_str = today.strftime("%Y%m%d")
        prefix = f"CR-{date_str}-"
        last = (
            cls.objects
            .filter(request_number__startswith=prefix)
            .order_by('-request_number')
            .values_list('request_number', flat=True)
            .first()
        )
        seq = int(last.split('-')[-1]) + 1 if last else 1
        return f"{prefix}{seq:04d}"

    @transaction.atomic
    def submit(self):
        if self.status != 'draft':
            raise ValidationError("Only draft requests can be submitted.")
        if not self.items.exists():
            raise ValidationError("Add at least one item before submitting.")
        self.status = 'submitted'
        self.save()

    @transaction.atomic
    def approve(self, performed_by=None, item_quantities=None):
        if self.status != 'submitted':
            raise ValidationError("Only submitted requests can be approved.")

        # item_quantities: optional {item_id: approved_quantity}
        item_quantities = item_quantities or {}
        any_approved = False
        for item in self.items.all():
            if str(item.id) in item_quantities:
                aq = Decimal(str(item_quantities[str(item.id)]))
            elif item.id in item_quantities:
                aq = Decimal(str(item_quantities[item.id]))
            else:
                aq = item.requested_quantity
            if aq < 0:
                raise ValidationError("Approved quantity cannot be negative.")
            item.approved_quantity = aq
            item.save(update_fields=['approved_quantity'])
            if aq > 0:
                any_approved = True

        if not any_approved:
            raise ValidationError("At least one item must have an approved quantity greater than zero.")

        self.status = 'approved'
        self.approved_by = performed_by
        self.approved_at = timezone.now()
        self.save()

    @transaction.atomic
    def reject(self, reason='', performed_by=None):
        if self.status != 'submitted':
            raise ValidationError("Only submitted requests can be rejected.")
        self.status = 'rejected'
        self.rejection_reason = reason
        self.save()

    @transaction.atomic
    def dispatch(self, performed_by=None, destination_location=None):
        if self.status != 'approved':
            raise ValidationError("Only approved requests can be dispatched.")
        if destination_location is None:
            raise ValidationError("A destination assembly location is required to dispatch.")
        if destination_location.type != 'assembly':
            raise ValidationError("Consumables can only be dispatched to an assembly location.")
        if destination_location == self.source_location:
            raise ValidationError("Destination location must differ from the source location.")

        self.destination_location = destination_location

        dispatched_any = False
        for item in self.items.select_related('material').all():
            qty = item.approved_quantity if item.approved_quantity is not None else item.requested_quantity
            if qty is None or qty <= 0:
                item.dispatched_quantity = Decimal('0')
                item.save(update_fields=['dispatched_quantity'])
                continue

            _draw_down(
                item.material,
                self.source_location,
                qty,
                movement_type='transfer_out',
                counterpart_location=destination_location,
                performed_by=performed_by,
                reference=self.request_number,
                notes=f"Consumable dispatch for {self.assembly_reference}".strip(),
            )
            item.dispatched_quantity = qty
            item.save(update_fields=['dispatched_quantity'])
            dispatched_any = True

        if not dispatched_any:
            raise ValidationError("Nothing to dispatch — all approved quantities are zero.")

        self.status = 'dispatched'
        self.dispatched_by = performed_by
        self.dispatched_at = timezone.now()
        self.save()

    @transaction.atomic
    def record_return(self, performed_by=None, used_quantities=None):
        if self.status != 'dispatched':
            raise ValidationError("Only dispatched requests can be returned.")

        used_quantities = used_quantities or {}

        for item in self.items.select_related('material').all():
            dispatched = item.dispatched_quantity or Decimal('0')
            if dispatched <= 0:
                item.used_quantity = Decimal('0')
                item.returned_quantity = Decimal('0')
                item.save(update_fields=['used_quantity', 'returned_quantity'])
                continue

            if str(item.id) in used_quantities:
                used = Decimal(str(used_quantities[str(item.id)]))
            elif item.id in used_quantities:
                used = Decimal(str(used_quantities[item.id]))
            else:
                used = dispatched  # default: assume everything was consumed

            if used < 0:
                raise ValidationError(f"Used quantity for {item.material.name} cannot be negative.")
            if used > dispatched:
                raise ValidationError(
                    f"Used quantity ({used}) for {item.material.name} cannot exceed "
                    f"dispatched quantity ({dispatched})."
                )

            returned = dispatched - used

            if used > 0:
                _draw_down(
                    item.material,
                    self.destination_location,
                    used,
                    movement_type='usage',
                    performed_by=performed_by,
                    reference=self.request_number,
                    notes=f"Consumable used for {self.assembly_reference}".strip(),
                )

            if returned > 0:
                _draw_down(
                    item.material,
                    self.destination_location,
                    returned,
                    movement_type='transfer_out',
                    counterpart_location=self.source_location,
                    performed_by=performed_by,
                    reference=self.request_number,
                    notes=f"Unused consumable returned from {self.assembly_reference}".strip(),
                )

            item.used_quantity = used
            item.returned_quantity = returned
            item.save(update_fields=['used_quantity', 'returned_quantity'])

        self.status = 'returned'
        self.returned_by = performed_by
        self.returned_at = timezone.now()
        self.save()


class ConsumableRequestItem(models.Model):
    request  = models.ForeignKey(ConsumableRequest, on_delete=models.CASCADE, related_name='items')
    material = models.ForeignKey(
        'master_data.RawMaterialAndConsumable', on_delete=models.PROTECT,
        related_name='consumable_request_items',
    )

    requested_quantity  = models.DecimalField(max_digits=14, decimal_places=4)
    approved_quantity   = models.DecimalField(max_digits=14, decimal_places=4, null=True, blank=True)
    dispatched_quantity = models.DecimalField(max_digits=14, decimal_places=4, null=True, blank=True)
    used_quantity       = models.DecimalField(max_digits=14, decimal_places=4, null=True, blank=True)
    returned_quantity   = models.DecimalField(max_digits=14, decimal_places=4, null=True, blank=True)

    class Meta:
        db_table = 'consumable_request_items'

    def __str__(self):
        return f"{self.request.request_number} – {self.material} x{self.requested_quantity}"
