from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('inventory_core', '0006_pallet'),
    ]

    operations = [
        # 1. Drop the old unique constraint on (pallet, batch)
        migrations.RemoveConstraint(
            model_name='palletitem',
            name='unique_pallet_batch',
        ),
        # 2. Remove the batch FK
        migrations.RemoveField(
            model_name='palletitem',
            name='batch',
        ),
        # 3. Add the lpn FK
        migrations.AddField(
            model_name='palletitem',
            name='lpn',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='pallet_items',
                to='inventory_core.lpn',
                default=1,  # temporary default for existing rows (table is empty in practice)
            ),
            preserve_default=False,
        ),
        # 4. Add new unique constraint on (pallet, lpn)
        migrations.AddConstraint(
            model_name='palletitem',
            constraint=models.UniqueConstraint(fields=['pallet', 'lpn'], name='unique_pallet_lpn'),
        ),
    ]
