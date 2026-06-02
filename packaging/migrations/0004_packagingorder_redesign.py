from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('assembly', '0002_assemblyorder_add_conversion_fields'),
        ('inventory_core', '0004_batch_finished_product_alter_batch_batch_type'),
        ('master_data', '0029_unit_base_unit'),
        ('packaging', '0003_packaging_two_phase'),
    ]

    operations = [
        # Add assembly_order FK
        migrations.AddField(
            model_name='packagingorder',
            name='assembly_order',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='packaging_orders',
                to='assembly.assemblyorder',
            ),
        ),
        # Make destination_location nullable
        migrations.AlterField(
            model_name='packagingorder',
            name='destination_location',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='packaging_dest_orders',
                to='master_data.location',
            ),
        ),
        # Remove fill-step fields
        migrations.RemoveField(model_name='packagingorder', name='source_location'),
        migrations.RemoveField(model_name='packagingorder', name='source_batch'),
        migrations.RemoveField(model_name='packagingorder', name='actual_quantity'),
        migrations.RemoveField(model_name='packagingorder', name='produced_quantity'),
        # Remove 'filled' status by altering the field choices
        migrations.AlterField(
            model_name='packagingorder',
            name='status',
            field=models.CharField(
                choices=[
                    ('draft', 'Draft'),
                    ('in_progress', 'In Progress'),
                    ('completed', 'Completed'),
                    ('cancelled', 'Cancelled'),
                ],
                default='draft',
                max_length=20,
            ),
        ),
        # Make finished_product_variant nullable (can come from assembly_order)
        migrations.AlterField(
            model_name='packagingorder',
            name='finished_product_variant',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='packaging_orders',
                to='master_data.finishedproductvariant',
            ),
        ),
    ]
