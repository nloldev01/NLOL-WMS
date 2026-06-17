from django.db import models, transaction
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.utils import timezone

User = get_user_model()


# ─────────────────────────────────────────────────────────────────────────────
# Dealer Order — dealer requests products
# ─────────────────────────────────────────────────────────────────────────────

class DealerOrder(models.Model):
    STATUS_CHOICES = [
        ('draft',      'Draft'),
        ('submitted',  'Submitted'),
        ('approved',   'Approved'),
        ('rejected',   'Rejected'),
        ('dispatched', 'Dispatched'),
        ('received',   'Received'),
    ]

    order_number     = models.CharField(max_length=50, unique=True)
    customer         = models.ForeignKey('sales.Customer', on_delete=models.PROTECT, related_name='dealer_orders')
    status           = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    notes            = models.TextField(blank=True)
    rejection_reason = models.TextField(blank=True)

    created_by  = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='created_dealer_orders')
    approved_by = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='approved_dealer_orders')
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'dealer_orders'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.order_number} ({self.get_status_display()})"

    @classmethod
    def generate_order_number(cls):
        today = timezone.localdate()
        date_str = today.strftime("%Y%m%d")
        prefix = f"DO-{date_str}-"
        last = (
            cls.objects
            .filter(order_number__startswith=prefix)
            .order_by('-order_number')
            .values_list('order_number', flat=True)
            .first()
        )
        seq = int(last.split('-')[-1]) + 1 if last else 1
        return f"{prefix}{seq:04d}"

    @transaction.atomic
    def submit(self):
        if self.status != 'draft':
            raise ValidationError("Only draft orders can be submitted.")
        if not self.items.exists():
            raise ValidationError("Add at least one item before submitting.")
        self.status = 'submitted'
        self.save()

    @transaction.atomic
    def approve(self, performed_by=None):
        if self.status != 'submitted':
            raise ValidationError("Only submitted orders can be approved.")
        self.status = 'approved'
        self.approved_by = performed_by
        self.save()

    @transaction.atomic
    def reject(self, reason='', performed_by=None):
        if self.status != 'submitted':
            raise ValidationError("Only submitted orders can be rejected.")
        self.status = 'rejected'
        self.rejection_reason = reason
        self.save()


class DealerOrderItem(models.Model):
    order                    = models.ForeignKey(DealerOrder, on_delete=models.CASCADE, related_name='items')
    finished_product_variant = models.ForeignKey(
        'master_data.FinishedProductVariant', on_delete=models.PROTECT, related_name='dealer_order_items'
    )
    requested_quantity = models.DecimalField(max_digits=14, decimal_places=4)
    approved_quantity  = models.DecimalField(max_digits=14, decimal_places=4, null=True, blank=True)

    class Meta:
        db_table = 'dealer_order_items'

    def __str__(self):
        return f"{self.order.order_number} – {self.finished_product_variant} x{self.requested_quantity}"


# ─────────────────────────────────────────────────────────────────────────────
# Dispatch Order — warehouse sends products to dealer
# ─────────────────────────────────────────────────────────────────────────────

class DispatchOrder(models.Model):
    STATUS_CHOICES = [
        ('draft',      'Draft'),
        ('dispatched', 'Dispatched'),
        ('received',   'Received'),
        ('rejected',   'Rejected'),
        ('cancelled',  'Cancelled'),
    ]

    dispatch_number = models.CharField(max_length=50, unique=True)
    dealer_order    = models.ForeignKey(
        DealerOrder, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='dispatches',
    )
    customer        = models.ForeignKey('sales.Customer', on_delete=models.PROTECT, related_name='dispatches')
    status          = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')

    vehicle_number  = models.CharField(max_length=50, blank=True)
    driver_name     = models.CharField(max_length=100, blank=True)
    notes           = models.TextField(blank=True)
    dealer_notes    = models.TextField(blank=True)

    dispatched_by   = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='dispatched_orders')
    created_by      = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='created_dispatches')

    dispatched_at   = models.DateTimeField(null=True, blank=True)
    created_at      = models.DateTimeField(auto_now_add=True)
    updated_at      = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'dispatch_orders'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.dispatch_number} ({self.get_status_display()})"

    @classmethod
    def generate_order_number(cls):
        today = timezone.localdate()
        date_str = today.strftime("%Y%m%d")
        prefix = f"DSP-{date_str}-"
        last = (
            cls.objects
            .filter(dispatch_number__startswith=prefix)
            .order_by('-dispatch_number')
            .values_list('dispatch_number', flat=True)
            .first()
        )
        seq = int(last.split('-')[-1]) + 1 if last else 1
        return f"{prefix}{seq:04d}"

    @transaction.atomic
    def confirm_dispatch(self, performed_by=None):
        if self.status != 'draft':
            raise ValidationError("Only draft dispatches can be confirmed.")
        if not self.items.exists():
            raise ValidationError("Add at least one item before dispatching.")

        from products_stock.models import FinishedProductStock, FinishedProductStockLog

        for item in self.items.select_related('finished_product_variant', 'batch').all():
            filter_kwargs = {
                'finished_product_variant': item.finished_product_variant,
                'quantity__gt': 0,
            }
            if item.batch:
                filter_kwargs['batch'] = item.batch

            stock_entry = (
                FinishedProductStock.objects
                .filter(**filter_kwargs)
                .order_by('-quantity')
                .first()
            )
            if not stock_entry or stock_entry.quantity < item.quantity:
                available = stock_entry.quantity if stock_entry else 0
                raise ValidationError(
                    f"Insufficient stock for {item.finished_product_variant}. "
                    f"Need {item.quantity}, available {available}."
                )
            FinishedProductStockLog.create_movement(
                finished_product_variant=item.finished_product_variant,
                location=stock_entry.location,
                movement_type='dispatch_out',
                quantity=item.quantity,
                batch=stock_entry.batch,
                lpn=stock_entry.lpn,
                performed_by=performed_by,
                reference=self.dispatch_number,
                notes=f"Dispatched to {self.customer.customer_name}",
            )

        if self.dealer_order_id:
            DealerOrder.objects.filter(pk=self.dealer_order_id).update(status='dispatched')

        self.status = 'dispatched'
        self.dispatched_by = performed_by
        self.dispatched_at = timezone.now()
        self.save()

    @transaction.atomic
    def confirm_received(self, performed_by=None, notes=''):
        if self.status != 'dispatched':
            raise ValidationError("Only dispatched orders can be marked as received.")

        for item in self.items.select_related('finished_product_variant').all():
            stock, _ = DealerStock.objects.select_for_update().get_or_create(
                customer=self.customer,
                finished_product_variant=item.finished_product_variant,
                defaults={'quantity': 0},
            )
            stock.quantity += item.quantity
            stock.save()

        if self.dealer_order_id:
            DealerOrder.objects.filter(pk=self.dealer_order_id).update(status='received')

        self.status = 'received'
        self.dealer_notes = notes
        self.save()

    @transaction.atomic
    def reject_delivery(self, performed_by=None, notes=''):
        if self.status != 'dispatched':
            raise ValidationError("Only dispatched orders can be rejected.")
        self.status = 'rejected'
        self.dealer_notes = notes
        self.save()


class DispatchItem(models.Model):
    dispatch                 = models.ForeignKey(DispatchOrder, on_delete=models.CASCADE, related_name='items')
    finished_product_variant = models.ForeignKey(
        'master_data.FinishedProductVariant', on_delete=models.PROTECT, related_name='dispatch_items'
    )
    batch    = models.ForeignKey(
        'inventory_core.Batch', null=True, blank=True,
        on_delete=models.PROTECT, related_name='dispatch_items',
    )
    quantity = models.DecimalField(max_digits=14, decimal_places=4)

    class Meta:
        db_table = 'dispatch_items'

    def __str__(self):
        return f"{self.dispatch.dispatch_number} – {self.finished_product_variant} x{self.quantity}"


# ─────────────────────────────────────────────────────────────────────────────
# Dealer Stock — running inventory held by a dealer
# ─────────────────────────────────────────────────────────────────────────────

class DealerStock(models.Model):
    customer                 = models.ForeignKey('sales.Customer', on_delete=models.PROTECT, related_name='dealer_stock')
    finished_product_variant = models.ForeignKey(
        'master_data.FinishedProductVariant', on_delete=models.PROTECT, related_name='dealer_stock'
    )
    quantity   = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table        = 'dealer_stock'
        unique_together = [('customer', 'finished_product_variant')]
        ordering        = ['customer', 'finished_product_variant']

    def __str__(self):
        return f"{self.customer.customer_name} | {self.finished_product_variant} x{self.quantity}"


# ─────────────────────────────────────────────────────────────────────────────
# Dealer Sale — dealer records outgoing sales from their stock
# ─────────────────────────────────────────────────────────────────────────────

class DealerSale(models.Model):
    sale_number  = models.CharField(max_length=50, unique=True)
    customer     = models.ForeignKey('sales.Customer', on_delete=models.PROTECT, related_name='dealer_sales')
    buyer_name   = models.CharField(max_length=255, blank=True)
    sale_date    = models.DateField()
    notes        = models.TextField(blank=True)
    is_confirmed = models.BooleanField(default=False)
    created_by   = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='dealer_sales_created')
    created_at   = models.DateTimeField(auto_now_add=True)
    updated_at   = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'dealer_sales'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.sale_number} – {self.customer.customer_name}"

    @classmethod
    def generate_sale_number(cls):
        today = timezone.localdate()
        date_str = today.strftime("%Y%m%d")
        prefix = f"DSL-{date_str}-"
        last = (
            cls.objects
            .filter(sale_number__startswith=prefix)
            .order_by('-sale_number')
            .values_list('sale_number', flat=True)
            .first()
        )
        seq = int(last.split('-')[-1]) + 1 if last else 1
        return f"{prefix}{seq:04d}"

    @transaction.atomic
    def confirm_sale(self, performed_by=None):
        if self.is_confirmed:
            raise ValidationError("This sale has already been confirmed.")
        if not self.items.exists():
            raise ValidationError("Add at least one item before confirming.")

        for item in self.items.select_related('finished_product_variant').all():
            try:
                stock = DealerStock.objects.select_for_update().get(
                    customer=self.customer,
                    finished_product_variant=item.finished_product_variant,
                )
            except DealerStock.DoesNotExist:
                raise ValidationError(f"No dealer stock found for {item.finished_product_variant}.")
            if stock.quantity < item.quantity:
                raise ValidationError(
                    f"Insufficient stock for {item.finished_product_variant}. "
                    f"Available: {stock.quantity}, requested: {item.quantity}."
                )
            stock.quantity -= item.quantity
            stock.save()

        self.is_confirmed = True
        self.save()


class DealerSaleItem(models.Model):
    sale                     = models.ForeignKey(DealerSale, on_delete=models.CASCADE, related_name='items')
    finished_product_variant = models.ForeignKey(
        'master_data.FinishedProductVariant', on_delete=models.PROTECT, related_name='dealer_sale_items'
    )
    quantity = models.DecimalField(max_digits=14, decimal_places=4)

    class Meta:
        db_table = 'dealer_sale_items'

    def __str__(self):
        return f"{self.sale.sale_number} – {self.finished_product_variant} x{self.quantity}"
