from django.conf import settings
from django.db import models
from .encryption import EncryptedDecimalField, EncryptedTextField

class Recipe(models.Model):
    product = models.ForeignKey(
        'master_data.Product', 
        related_name='recipes', 
        on_delete=models.CASCADE
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'production_recipes'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.product.name} - {self.name}"

class RecipeItem(models.Model):
    recipe = models.ForeignKey(
        Recipe,
        related_name='items',
        on_delete=models.CASCADE
    )
    material = models.ForeignKey(
        'master_data.RawMaterialAndConsumable',
        on_delete=models.PROTECT
    )
    quantity = EncryptedDecimalField()
    encrypted_material_name = EncryptedTextField(blank=True, default='')

    class Meta:
        db_table = 'production_recipe_items'
        unique_together = ('recipe', 'material')

    def __str__(self):
        return f"{self.material.name} x {self.quantity} for {self.recipe.name}"


class ProductionOrder(models.Model):
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('planned', 'Planned'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]

    order_number = models.CharField(max_length=50, unique=True)
    mixture_id = models.CharField(
        max_length=50, unique=True, null=True, blank=True,
        help_text="Auto-generated ID for orders created without a recipe (custom mix)."
    )
    recipe = models.ForeignKey(
        Recipe, null=True, blank=True,
        on_delete=models.PROTECT, related_name='production_orders'
    )
    kettle = models.ForeignKey(
        'master_data.Location', 
        on_delete=models.PROTECT, 
        related_name='production_orders',
        help_text="The Machine/Location (e.g. Kettle) where this order is produced."
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    
    target_quantity = models.DecimalField(max_digits=14, decimal_places=4)
    produced_quantity = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    
    start_time = models.DateTimeField(null=True, blank=True)
    expected_end_time = models.DateTimeField(null=True, blank=True)
    actual_end_time = models.DateTimeField(null=True, blank=True)

    mixing_temperature = models.DecimalField(max_digits=7, decimal_places=2, null=True, blank=True, help_text="Target temperature in °C")
    operator_notes = models.TextField(blank=True, null=True)

    produced_batch = models.ForeignKey(
        'inventory_core.Batch',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='production_orders',
        help_text="Auto-generated PRD batch for the finished product on order completion."
    )

    materials_confirmed = models.BooleanField(
        default=False,
        help_text="Set to True once operator has verified all materials are loaded in the kettle."
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'production_orders'
        ordering = ['-created_at']

    def __str__(self):
        name = self.recipe.product.name if self.recipe else f"Custom Mix {self.mixture_id}"
        return f"{self.order_number} - {name} ({self.get_status_display()})"


class FirstFillTest(models.Model):
    """
    A COA ("test_batches" in the design doc) — one First Fill Test attempt for
    a PRD batch, sitting between Mixing and Assembly. Multiple attempts per
    batch are allowed (retests). Which characteristics get tested and their
    limits come entirely from `test_definition` (a data row, never code) —
    this model only holds the header + workflow state.

    Batch.quality_status (the Assembly gate) is only updated once the
    certificate is Issued, not on every save.
    """
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('reviewed', 'Reviewed'),
        ('issued', 'Issued'),
    ]
    VERDICT_CHOICES = [
        ('pending', 'Pending'),
        ('conforms', 'Conforms'),
        ('non_conforming', 'Non-conforming'),
    ]

    batch = models.ForeignKey(
        'inventory_core.Batch',
        on_delete=models.CASCADE,
        related_name='first_fill_tests',
    )
    test_definition = models.ForeignKey(
        'master_data.TestDefinition',
        null=True, blank=True,
        on_delete=models.PROTECT,
        related_name='batches',
        help_text="Report format used for this batch (e.g. Engine Oil COA). Always set by start().",
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    overall_verdict = models.CharField(max_length=20, choices=VERDICT_CHOICES, default='pending')

    batch_quantity = models.DecimalField(max_digits=14, decimal_places=4, null=True, blank=True)
    quantity_unit = models.CharField(max_length=20, blank=True, default='')
    date_of_sample_receipt = models.DateField(null=True, blank=True)
    date_of_analysis = models.DateField(null=True, blank=True)
    date_of_issue = models.DateField(null=True, blank=True)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='first_fill_tests_created',
    )
    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='first_fill_tests_approved',
    )
    remarks = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    issued_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'production_first_fill_tests'
        ordering = ['-created_at']

    def __str__(self):
        return f"First Fill Test for {self.batch.batch_code} ({self.get_status_display()})"


class FirstFillTestResult(models.Model):
    """
    One measured characteristic ("test_results" line item) within a
    FirstFillTest. Spec fields are snapshotted from TestDefinitionParameter
    at the moment the test was started, so a re-opened certificate always
    shows the limit that was active when it was tested — even if the master
    TestDefinitionParameter row is edited later.
    """
    VERDICT_CHOICES = [
        ('Pass', 'Pass'),
        ('Fail', 'Fail'),
        ('NA', 'N/A'),
    ]

    test = models.ForeignKey(FirstFillTest, related_name='results', on_delete=models.CASCADE)
    parameter = models.ForeignKey('master_data.Parameter', null=True, blank=True, on_delete=models.PROTECT, related_name='+')
    sr_no = models.PositiveIntegerField()
    mandatory = models.BooleanField(default=True)

    # Snapshot of TestDefinitionParameter at test-start time
    characteristic = models.CharField(max_length=200)
    unit = models.CharField(max_length=50, blank=True)
    test_method = models.CharField(max_length=100, blank=True)
    spec_type = models.CharField(max_length=10, choices=[('Report', 'Report'), ('Min', 'Min'), ('Max', 'Max'), ('Range', 'Range')], default='Report')
    min_value = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)
    max_value = models.DecimalField(max_digits=10, decimal_places=4, null=True, blank=True)

    result_text = models.CharField(max_length=200, blank=True, default='')
    result_numeric = models.DecimalField(max_digits=14, decimal_places=4, null=True, blank=True)
    verdict = models.CharField(max_length=10, choices=VERDICT_CHOICES, default='NA')

    entered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True,
        on_delete=models.SET_NULL, related_name='+',
    )
    entered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'production_first_fill_test_results'
        ordering = ['sr_no']

    def __str__(self):
        return f"{self.characteristic} = {self.result_text}"

    def specification_display(self):
        if self.spec_type == 'Report':
            return 'Report'
        if self.spec_type == 'Min':
            return f"{self.min_value} Min"
        if self.spec_type == 'Max':
            return f"{self.max_value} Max"
        if self.spec_type == 'Range':
            return f"{self.min_value} - {self.max_value}"
        return ''


class ProductionOrderMaterial(models.Model):
    order = models.ForeignKey(ProductionOrder, on_delete=models.CASCADE, related_name='materials')
    material = models.ForeignKey('master_data.RawMaterialAndConsumable', on_delete=models.PROTECT)
    
    planned_qty = models.DecimalField(max_digits=14, decimal_places=4)
    actual_load_qty = models.DecimalField(
        max_digits=14, decimal_places=4, null=True, blank=True,
        help_text="Actual quantity loaded by operator; may differ from planned. Used for consumption."
    )
    actual_consumed_qty = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    wastage_qty = models.DecimalField(max_digits=14, decimal_places=4, default=0)
    is_loaded = models.BooleanField(default=False, help_text="Operator confirms material has been physically loaded into the kettle.")
    
    class Meta:
        db_table = 'production_order_materials'
        unique_together = ('order', 'material')

    def __str__(self):
        return f"{self.material.name} for {self.order.order_number}"
