from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('inventory_core', '0005_batch_finished_product_variant'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Pallet',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('pallet_code', models.CharField(max_length=50, unique=True)),
                ('notes', models.TextField(blank=True)),
                ('is_sealed', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='pallets',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'db_table': 'inventory_pallets',
                'ordering': ['-created_at'],
            },
        ),
        migrations.CreateModel(
            name='PalletItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('quantity', models.DecimalField(decimal_places=4, max_digits=14)),
                ('pallet', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='items',
                    to='inventory_core.pallet',
                )),
                ('batch', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='pallet_items',
                    to='inventory_core.batch',
                )),
            ],
            options={
                'db_table': 'inventory_pallet_items',
            },
        ),
        migrations.AddConstraint(
            model_name='palletitem',
            constraint=models.UniqueConstraint(fields=['pallet', 'batch'], name='unique_pallet_batch'),
        ),
    ]
