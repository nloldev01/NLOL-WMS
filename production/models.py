from django.db import models

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
    quantity = models.DecimalField(max_digits=14, decimal_places=4)

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
