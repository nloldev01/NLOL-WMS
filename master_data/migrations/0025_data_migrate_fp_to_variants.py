from django.db import migrations


def forward(apps, schema_editor):
    FinishedProduct = apps.get_model('master_data', 'FinishedProduct')
    FinishedProductVariant = apps.get_model('master_data', 'FinishedProductVariant')

    for fp in FinishedProduct.objects.all():
        if fp.unit_id and fp.volume is not None and fp.volume_unit_id:
            FinishedProductVariant.objects.create(
                finished_product=fp,
                unit_id=fp.unit_id,
                volume=fp.volume,
                volume_unit_id=fp.volume_unit_id,
                secondary_unit_id=fp.secondary_unit_id,
                capacity_value=fp.capacity_value if fp.capacity_value else fp.volume,
                base_quantity=fp.base_quantity if fp.base_quantity else 1,
                sku_code=fp.sku_code,
                is_available=fp.is_available,
                added_sticker=fp.added_sticker,
                sticker_name=fp.sticker_name,
            )


def backward(apps, schema_editor):
    FinishedProductVariant = apps.get_model('master_data', 'FinishedProductVariant')
    FinishedProductVariant.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('master_data', '0024_add_finished_product_variant'),
    ]

    operations = [
        migrations.RunPython(forward, backward),
    ]
