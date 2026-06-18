from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('master_data', '0031_add_name_and_product_code_to_variant'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='productsubgroup',
            name='group',
        ),
    ]
