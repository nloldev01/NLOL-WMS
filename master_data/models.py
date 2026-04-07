from django.db import models


class Unit(models.Model):
    name        = models.CharField(max_length=100, unique=True)
    code        = models.CharField(max_length=20, unique=True)
    symbol      = models.CharField(max_length=20)
    description = models.TextField(blank=True, null=True)
    is_active   = models.BooleanField(default=True)
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'master_units'
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.symbol})"

class FiscalYear(models.Model):
    name       = models.CharField(max_length=20, unique=True)  # e.g. "2081/82"
    start_date = models.DateField()
    end_date   = models.DateField()
    is_active  = models.BooleanField(default=False)  # only one should be active at a time
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'master_fiscal_years'
        ordering = ['-start_date']

    def __str__(self):
        return self.name

class Location(models.Model):
    TYPE_CHOICES = [
        ('warehouse', 'Warehouse'),
        ('zone',      'Zone'),
        ('block',     'Block'),
        ('aisle',     'Aisle'),
        ('rack',      'Rack'),
        ('shelf',     'Shelf'),
    ]

    name       = models.CharField(max_length=255)
    short_code = models.CharField(max_length=20)
    type       = models.CharField(max_length=50, choices=TYPE_CHOICES)
    parent     = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL, related_name='children')
    is_active  = models.BooleanField(default=True)

    class Meta:
        unique_together = ['short_code', 'parent']  # SH-01 can exist under multiple racks, but not twice under the same rack

    def __str__(self):
        return f"[{self.short_code}] {self.name}"

    def get_full_code(self):
        """Returns globally unique full path code e.g. WH1-STK-BLK-A-RK03-SH01"""
        parts = [self.short_code]
        parent = self.parent
        while parent:
            parts.insert(0, parent.short_code)
            parent = parent.parent
        return "-".join(parts)

    def get_full_path(self):
        """Returns human readable full path e.g. Main Warehouse → Stockyard → Block A → Shelf 1"""
        parts = [self.name]
        parent = self.parent
        while parent:
            parts.insert(0, parent.name)
            parent = parent.parent
        return " → ".join(parts)


class Asset(models.Model):
    STATUS_CHOICES = [
        ('active',      'Active'),
        ('inactive',    'Inactive'),
        ('maintenance', 'Maintenance'),
    ]

    name          = models.CharField(max_length=100)
    asset_type    = models.CharField(max_length=100)
    capacity      = models.FloatField(null=True, blank=True)
    capacity_unit = models.ForeignKey('master_data.Unit', null=True, blank=True, on_delete=models.SET_NULL)
    status        = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    location = models.ForeignKey(
        'Location',
        null=False,
        blank=False,
        on_delete=models.PROTECT,
        related_name='assets'
    )

    def __str__(self):
        return self.name


class AssetParameter(models.Model):
    asset = models.ForeignKey(Asset, on_delete=models.CASCADE, related_name='parameters')
    key   = models.CharField(max_length=100)
    value = models.CharField(max_length=255)
    unit  = models.ForeignKey('master_data.Unit', null=True, blank=True, on_delete=models.SET_NULL)

    def __str__(self):
        return f"{self.asset.name} — {self.key}: {self.value}"


class RawMaterialAndConsumable(models.Model):
    TYPE_CHOICES = [
        ('raw_material', 'Raw Material'),
        ('consumable',   'Consumable'),
    ]

    name = models.CharField(max_length=255)
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    unit = models.ForeignKey(
        'Unit',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='raw_materials_and_consumables'
    )

    class Meta:
        db_table = 'master_raw_materials_and_consumables'
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.get_type_display()})"


class ProductGroup(models.Model):
    name = models.CharField(max_length=255, unique=True)

    class Meta:
        db_table = 'master_product_groups'
        ordering = ['name']

    def __str__(self):
        return self.name


class ProductSubGroup(models.Model):
    name = models.CharField(max_length=255, unique=True)
    group = models.ForeignKey(
        ProductGroup,
        on_delete=models.PROTECT,
        related_name='sub_groups'
    )

    class Meta:
        db_table = 'master_product_sub_groups'
        ordering = ['name']

    def __str__(self):
        return self.name


class ProductSegment(models.Model):
    name = models.CharField(max_length=255, unique=True)

    class Meta:
        db_table = 'master_product_segments'
        ordering = ['name']

    def __str__(self):
        return self.name


class Product(models.Model):
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    is_available = models.BooleanField(default=True)
    product_group = models.ForeignKey(
        ProductGroup,
        on_delete=models.PROTECT,
        related_name='products'
    )
    product_segment = models.ForeignKey(
        ProductSegment,
        on_delete=models.PROTECT,
        related_name='products'
    )
    product_sub_group = models.ForeignKey(
        ProductSubGroup,
        on_delete=models.PROTECT,
        related_name='products'
    )
    unit = models.ForeignKey(
        'Unit',
        on_delete=models.PROTECT,
        related_name='products'
    )

    class Meta:
        db_table = 'products'
        ordering = ['name']

    def __str__(self):
        return self.name

