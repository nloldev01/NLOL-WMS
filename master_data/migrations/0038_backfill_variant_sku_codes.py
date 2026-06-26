from django.db import migrations


def backfill_variant_sku_codes(apps, schema_editor):
    """Generate sku_code for variants created before auto-generation was added.
    Mirrors FinishedProductVariant._generate_sku_code(), reimplemented here since
    migrations must not depend on live model methods."""
    FinishedProductVariant = apps.get_model('master_data', 'FinishedProductVariant')
    existing_codes = set(
        FinishedProductVariant.objects.exclude(sku_code__isnull=True)
        .exclude(sku_code='')
        .values_list('sku_code', flat=True)
    )
    missing = FinishedProductVariant.objects.filter(sku_code__isnull=True) | \
        FinishedProductVariant.objects.filter(sku_code='')
    for variant in missing.order_by('finished_product_id', 'pk'):
        seq = FinishedProductVariant.objects.filter(
            finished_product_id=variant.finished_product_id
        ).count() + 1
        candidate = f"FP{variant.finished_product_id}-{seq:02d}"
        while candidate in existing_codes:
            seq += 1
            candidate = f"FP{variant.finished_product_id}-{seq:02d}"
        existing_codes.add(candidate)
        variant.sku_code = candidate
        variant.save(update_fields=['sku_code'])


class Migration(migrations.Migration):

    dependencies = [
        ('master_data', '0037_parameter_testdefinition_product_default_test_and_more'),
    ]

    operations = [
        migrations.RunPython(backfill_variant_sku_codes, migrations.RunPython.noop),
    ]
