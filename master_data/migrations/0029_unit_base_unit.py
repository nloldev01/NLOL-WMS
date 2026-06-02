from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('master_data', '0028_add_jar_icon'),
    ]

    operations = [
        migrations.AddField(
            model_name='unit',
            name='base_unit',
            field=models.ForeignKey(
                blank=True,
                help_text='Base/volume unit this unit maps to (e.g. Bottle → Litre)',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='derived_units',
                to='master_data.unit',
            ),
        ),
    ]
