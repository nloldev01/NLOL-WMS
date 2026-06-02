from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('master_data', '0029_unit_base_unit'),
        ('packaging', '0003_packaging_two_phase'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='VariantPackagingMaterial',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('quantity_per_unit', models.DecimalField(decimal_places=4, max_digits=14)),
                ('finished_product_variant', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='packaging_materials',
                    to='master_data.finishedproductvariant',
                )),
                ('material', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='variant_bom_lines',
                    to='master_data.rawmaterialandconsumable',
                )),
            ],
            options={
                'db_table': 'assembly_variant_packaging_materials',
                'ordering': ['material__name'],
                'unique_together': {('finished_product_variant', 'material')},
            },
        ),
        migrations.CreateModel(
            name='AssemblyOrder',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('assembly_number', models.CharField(max_length=50, unique=True)),
                ('status', models.CharField(
                    choices=[
                        ('draft', 'Draft'),
                        ('in_progress', 'In Progress'),
                        ('completed', 'Completed'),
                        ('cancelled', 'Cancelled'),
                    ],
                    default='draft',
                    max_length=20,
                )),
                ('target_quantity', models.DecimalField(decimal_places=4, max_digits=14)),
                ('actual_quantity', models.DecimalField(blank=True, decimal_places=4, max_digits=14, null=True)),
                ('notes', models.TextField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('assembly_location', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='assembly_orders',
                    to='master_data.location',
                )),
                ('finished_product_variant', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='assembly_orders',
                    to='master_data.finishedproductvariant',
                )),
                ('packaging_order', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='assembly_orders',
                    to='packaging.packagingorder',
                )),
                ('performed_by', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='assembly_orders',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'db_table': 'assembly_orders',
                'ordering': ['-created_at'],
            },
        ),
    ]
