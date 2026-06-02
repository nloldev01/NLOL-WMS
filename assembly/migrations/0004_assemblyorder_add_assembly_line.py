from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('assembly', '0003_add_assembly_material_line'),
        ('master_data', '0029_unit_base_unit'),
    ]

    operations = [
        migrations.AddField(
            model_name='assemblyorder',
            name='assembly_line',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='assembly_line_orders',
                to='master_data.location',
                limit_choices_to={'type': 'assembly'},
            ),
        ),
    ]
