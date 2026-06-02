from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('inventory_core', '0004_batch_finished_product_alter_batch_batch_type'),
        ('packaging', '0002_remove_packagingorder_finished_product_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='packagingorder',
            name='actual_quantity',
            field=models.DecimalField(blank=True, decimal_places=4, max_digits=14, null=True),
        ),
        migrations.AddField(
            model_name='packagingorder',
            name='produced_lpn',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='packaging_orders',
                to='inventory_core.lpn',
            ),
        ),
        migrations.AlterField(
            model_name='packagingorder',
            name='status',
            field=models.CharField(
                choices=[
                    ('draft', 'Draft'),
                    ('in_progress', 'In Progress'),
                    ('filled', 'Filled'),
                    ('completed', 'Completed'),
                    ('cancelled', 'Cancelled'),
                ],
                default='draft',
                max_length=20,
            ),
        ),
    ]
