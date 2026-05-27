from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('master_data', '0019_alter_asset_status_alter_location_type'),
    ]

    operations = [
        migrations.AlterField(
            model_name='location',
            name='type',
            field=models.CharField(
                choices=[
                    ('warehouse', 'Warehouse'),
                    ('building', 'Building'),
                    ('factory', 'Factory'),
                    ('zone', 'Zone'),
                    ('block', 'Block'),
                    ('aisle', 'Aisle'),
                    ('rack', 'Rack'),
                    ('shelf', 'Shelf'),
                    ('tank', 'Tank'),
                    ('kettle', 'Kettle'),
                    ('assembly', 'Assembly'),
                ],
                max_length=50,
            ),
        ),
    ]
