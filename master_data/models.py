from django.db import models
import uuid
from django.db import connection


class Unit(models.Model):
    UNIT_TYPE_CHOICES = [
        ('primary',   'Primary'),
        ('secondary', 'Secondary'),
    ]
    ICON_CHOICES = [
        ('bottle',  'Bottle'),
        ('can',     'Can / Tin'),
        ('pail',    'Pail / Bucket'),
        ('drum',    'Drum / Barrel'),
        ('pouch',   'Pouch / Bag'),
        ('box',     'Box / Carton'),
        ('jug',     'Jug / Jerry Can'),
        ('jar',     'Jar'),
        ('other',   'Other'),
    ]

    name        = models.CharField(max_length=100, unique=True)
    code        = models.CharField(max_length=20, unique=True)
    symbol      = models.CharField(max_length=20)
    unit_type   = models.CharField(max_length=20, choices=UNIT_TYPE_CHOICES, default='primary')
    icon        = models.CharField(max_length=20, choices=ICON_CHOICES, default='other', blank=True)
    base_unit   = models.ForeignKey(
        'self',
        null=True, blank=True,
        on_delete=models.SET_NULL,
        related_name='derived_units',
        help_text="Base/volume unit this unit maps to (e.g. Bottle → Litre)",
    )
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

def generate_code():
    """Generate a unique code, retrying if collision occurs"""
    from master_data.models import Location  # Import here to avoid circular imports
    
    while True:
        return uuid.uuid4().hex[:8]
            
class Location(models.Model):
    TYPE_CHOICES = [
        ('warehouse', 'Warehouse'),
        ('building',  'Building'),
        ('factory',   'Factory'),
        ('zone',      'Zone'),
        ('block',     'Block'),
        ('aisle',     'Aisle'),
        ('rack',      'Rack'),
        ('shelf',     'Shelf'),
        ('tank',      'Tank'),
        ('kettle',    'Kettle'),
        ('assembly',  'Assembly'),
    ]
    
    PARENT_TYPE_CHOICES = ['warehouse', 'building', 'factory','zone','block','aisle','rack','shelf']

    name       = models.CharField(max_length=255)
    code = models.CharField(max_length=8, unique=False, default='', blank=True)
    short_code = models.CharField(max_length=20)
    type       = models.CharField(max_length=50, choices=TYPE_CHOICES)
    parent     = models.ForeignKey('self', null=True, blank=True, on_delete=models.SET_NULL, related_name='children')
    is_active  = models.BooleanField(default=True)
    is_production_area = models.BooleanField(default=False)
    linked_asset = models.OneToOneField(
        'Asset',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='virtual_location'
    )

    class Meta:
        unique_together = ['short_code', 'parent']  # SH-01 can exist under multiple racks, but not twice under the same rack

    def clean(self):
        from django.core.exceptions import ValidationError
        if self.parent and self.parent.type not in self.PARENT_TYPE_CHOICES:
            raise ValidationError(
                f"Parent location must be one of {', '.join(self.PARENT_TYPE_CHOICES)}, "
                f"but '{self.parent.name}' is of type '{self.parent.type}'."
            )
        if self.parent and self.parent.id == self.id:
            raise ValidationError("A location cannot be its own parent.")

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
    
    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)


class Asset(models.Model):
    STATUS_CHOICES = [
        ('active',      'Active'),
        ('inactive',    'Inactive'),
        ('maintenance', 'Maintenance'),
        ('mixing',      'Mixing'),
        ('idle',        'Idle'),
    ]

    name = models.CharField(max_length=100)
    asset_type = models.CharField(max_length=100)
    capacity = models.FloatField(null=True, blank=True)
    capacity_unit = models.ForeignKey(
        'master_data.Unit',
        null=True,
        blank=True,
        on_delete=models.SET_NULL
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')

    def __str__(self):
        return self.name


class AssetParameter(models.Model):
    asset = models.ForeignKey(
        Asset,
        on_delete=models.CASCADE,
        related_name='parameters'  # IMPORTANT
    )
    key = models.CharField(max_length=100)
    value = models.TextField()  # better than CharField
    unit = models.ForeignKey(
        'master_data.Unit',
        null=True,
        blank=True,
        on_delete=models.SET_NULL
    )

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
    secondary_unit = models.ForeignKey(
        'Unit',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='secondary_raw_materials'
    )
    capacity_value = models.DecimalField(max_digits=10, decimal_places=4, default=0, null=True, blank=True)

    class Meta:
        db_table = 'master_raw_materials_and_consumables'
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.get_type_display()})"

class Supplier(models.Model):
    name = models.CharField(max_length=255, unique=True)

    contact_person = models.CharField(max_length=255, blank=True, null=True)

    phone = models.CharField(max_length=20, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)

    address = models.TextField(blank=True, null=True)

    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'suppliers'
        ordering = ['name']

    def __str__(self):
        return self.name
    
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
        'ProductGroup',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='subgroups',
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
    name = models.CharField(max_length=255, unique=True)
    description = models.TextField(blank=True, null=True)
    is_available = models.BooleanField(default=True)
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


class FinishedProduct(models.Model):
    name = models.CharField(max_length=255, blank=True)
    description = models.TextField(blank=True, null=True)
    base_product = models.ForeignKey(
        'Product',
        on_delete=models.PROTECT,
        related_name='finished_products'
    )
    is_available = models.BooleanField(default=True)
    product_group = models.ForeignKey(
        ProductGroup,
        on_delete=models.PROTECT,
        related_name='finished_products'
    )
    product_segment = models.ForeignKey(
        ProductSegment,
        on_delete=models.PROTECT,
        related_name='finished_products'
    )
    product_sub_group = models.ForeignKey(
        ProductSubGroup,
        on_delete=models.PROTECT,
        related_name='finished_products'
    )

    class Meta:
        db_table = 'finished_products'
        ordering = ['name']

    def save(self, *args, **kwargs):
        if not self.name and self.base_product_id:
            self.name = self.base_product.name
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class FinishedProductVariant(models.Model):
    MATERIAL_CHOICES = [
        ('pet',   'PET Plastic'),
        ('hdpe',  'HDPE Plastic'),
        ('glass', 'Glass'),
        ('metal', 'Metal / Tin'),
        ('foil',  'Foil / Laminate'),
        ('paper', 'Paper / Cardboard'),
        ('other', 'Other'),
    ]

    finished_product = models.ForeignKey(
        'FinishedProduct',
        on_delete=models.PROTECT,
        related_name='variants'
    )
    # Container type = primary unit from Unit master data (e.g., Bottle, Can, Pouch)
    unit = models.ForeignKey(
        'Unit',
        on_delete=models.PROTECT,
        related_name='fp_variants_unit'
    )
    material = models.CharField(max_length=20, choices=MATERIAL_CHOICES, blank=True, null=True)
    volume   = models.DecimalField(max_digits=14, decimal_places=4)
    volume_unit = models.ForeignKey(
        'Unit',
        on_delete=models.PROTECT,
        related_name='fp_variants_volume'
    )
    secondary_unit = models.ForeignKey(
        'Unit',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='fp_variants_secondary'
    )
    capacity_value = models.DecimalField(max_digits=14, decimal_places=4, default=0, null=True, blank=True)
    base_quantity  = models.DecimalField(max_digits=14, decimal_places=4)
    name           = models.CharField(max_length=255, blank=True, null=True)
    product_code   = models.CharField(max_length=50, blank=True, null=True)
    sku_code       = models.CharField(max_length=50, unique=True, blank=True, null=True)
    is_available   = models.BooleanField(default=True)
    added_sticker  = models.BooleanField(default=False)
    sticker_name   = models.CharField(max_length=255, blank=True, null=True)
    created_at     = models.DateTimeField(auto_now_add=True)
    updated_at     = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'finished_product_variants'
        ordering = ['finished_product__name', 'volume']
        unique_together = ['finished_product', 'unit', 'volume', 'volume_unit']

    def __str__(self):
        return f"{self.finished_product.name} {self.volume}{self.volume_unit.symbol} ({self.unit.name})"

