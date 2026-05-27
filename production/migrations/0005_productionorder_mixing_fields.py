from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0004_fcc'),
    ]

    operations = [
        migrations.AddField(
            model_name='productionorder',
            name='mixing_temperature',
            field=models.DecimalField(blank=True, decimal_places=2, help_text='Target temperature in °C', max_digits=7, null=True),
        ),
        migrations.AddField(
            model_name='productionorder',
            name='operator_notes',
            field=models.TextField(blank=True, null=True),
        ),
    ]
