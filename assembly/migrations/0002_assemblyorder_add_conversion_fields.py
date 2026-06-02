from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('assembly', '0001_initial'),
        ('inventory_core', '0004_batch_finished_product_alter_batch_batch_type'),
        ('master_data', '0029_unit_base_unit'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='assemblyorder',
            name='assembly_location',
        ),
        migrations.AddField(
            model_name='assemblyorder',
            name='source_location',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='assembly_source_orders',
                to='master_data.location',
                default=1,
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='assemblyorder',
            name='source_batch',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='assembly_source',
                to='inventory_core.batch',
            ),
        ),
        migrations.AddField(
            model_name='assemblyorder',
            name='destination_location',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='assembly_dest_orders',
                to='master_data.location',
                default=1,
            ),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='assemblyorder',
            name='produced_batch',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='assembly_produced',
                to='inventory_core.batch',
            ),
        ),
    ]
