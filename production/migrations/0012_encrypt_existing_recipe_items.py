from django.db import migrations


def encrypt_existing_items(apps, schema_editor):
    from production.encryption import encrypt_value
    RecipeItem = apps.get_model('production', 'RecipeItem')
    for item in RecipeItem.objects.select_related('material').all():
        changed = False
        raw_qty = item.quantity
        if raw_qty and not str(raw_qty).startswith('gAAAAA'):
            try:
                item.quantity = encrypt_value(str(raw_qty))
                changed = True
            except Exception:
                pass
        if item.material_id:
            try:
                mat_name = item.material.name
                if mat_name:
                    item.encrypted_material_name = encrypt_value(mat_name)
                    changed = True
            except Exception:
                pass
        if changed:
            item.save(update_fields=['quantity', 'encrypted_material_name'])


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0011_encrypt_recipe_fields'),
    ]

    operations = [
        migrations.RunPython(encrypt_existing_items, migrations.RunPython.noop),
    ]
