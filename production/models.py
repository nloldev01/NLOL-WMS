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
