from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0003_productionorder_actual_end_time_and_more'),
        ('master_data', '0017_location_is_production_area'),
        ('accounts', '0007_user_is_2fa_enabled_user_otp_base32_secret'),
    ]

    operations = [
        migrations.CreateModel(
            name='FCCCounter',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('prefix', models.CharField(default='F', max_length=2)),
                ('last_value', models.PositiveIntegerField(default=0)),
            ],
            options={'db_table': 'production_fcc_counter'},
        ),
        migrations.CreateModel(
            name='FactoryContainerCode',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('fcc_code', models.CharField(max_length=50, unique=True)),
                ('batch_code', models.CharField(blank=True, default='', max_length=50)),
                ('quantity', models.FloatField(default=0)),
                ('notes', models.TextField(blank=True, default='')),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('location', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='fccs', to='master_data.location')),
                ('material', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='fccs', to='master_data.rawmaterialandconsumable')),
                ('parent_fcc', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='child_fccs', to='production.factorycontainercode')),
                ('unit', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='master_data.unit')),
            ],
            options={'db_table': 'production_fccs', 'ordering': ['-created_at']},
        ),
        migrations.CreateModel(
            name='FCCMovement',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('movement_type', models.CharField(choices=[
                    ('received', 'Received from Warehouse'),
                    ('load', 'Loaded into Kettle/Tank'),
                    ('transfer', 'Transferred to Location'),
                    ('process', 'Processed / Used'),
                    ('complete', 'Batch Completed'),
                    ('discard', 'Discarded / Wastage'),
                    ('adjustment', 'Adjustment'),
                ], max_length=20)),
                ('quantity', models.FloatField()),
                ('notes', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('fcc', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='movements', to='production.factorycontainercode')),
                ('from_location', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='fcc_movements_from', to='master_data.location')),
                ('to_location', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='fcc_movements_to', to='master_data.location')),
                ('production_order', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='fcc_movements', to='production.productionorder')),
                ('recorded_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='fcc_movements', to='accounts.user')),
            ],
            options={'db_table': 'production_fcc_movements', 'ordering': ['-created_at']},
        ),
    ]
