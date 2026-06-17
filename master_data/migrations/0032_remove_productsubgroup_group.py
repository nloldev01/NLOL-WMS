from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('master_data', '0031_add_name_and_product_code_to_variant'),
    ]

    operations = [
        # The group_id column was never present in the actual DB,
        # so we only update Django's state without issuing any SQL.
        migrations.SeparateDatabaseAndState(
            database_operations=[],
            state_operations=[
                migrations.RemoveField(
                    model_name='productsubgroup',
                    name='group',
                ),
            ],
        ),
    ]
