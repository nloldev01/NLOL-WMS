from django.db import migrations, connection
import decimal


def fix_double_encrypted(apps, schema_editor):
    from production.encryption import encrypt_value, decrypt_value

    def resolve(raw):
        """Decrypt raw until we reach a plain value, return it."""
        if not raw:
            return raw
        # Try decrypting layers until we hit something that can't be decrypted
        current = raw
        for _ in range(5):
            try:
                nxt = decrypt_value(current)
                current = nxt
            except Exception:
                return current
        return current

    with connection.cursor() as cursor:
        cursor.execute('SELECT id, quantity, encrypted_material_name FROM production_recipe_items')
        rows = cursor.fetchall()
        for row_id, qty_raw, name_raw in rows:
            plain_qty  = resolve(qty_raw)
            plain_name = resolve(name_raw)

            # Validate and re-encrypt quantity
            try:
                decimal.Decimal(str(plain_qty))
                fixed_qty = encrypt_value(str(plain_qty))
            except Exception:
                continue  # Can't recover this row, leave it alone

            fixed_name = encrypt_value(plain_name) if plain_name else (name_raw or '')

            cursor.execute(
                'UPDATE production_recipe_items SET quantity=%s, encrypted_material_name=%s WHERE id=%s',
                [fixed_qty, fixed_name, row_id]
            )


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0012_encrypt_existing_recipe_items'),
    ]

    operations = [
        migrations.RunPython(fix_double_encrypted, migrations.RunPython.noop),
    ]
