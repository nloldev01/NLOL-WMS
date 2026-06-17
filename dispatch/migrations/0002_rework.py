import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('dispatch', '0001_initial'),
        ('inventory_core', '0005_batch_finished_product_variant'),
        ('master_data', '0030_make_finished_product_name_optional'),
        ('sales', '0003_add_retail_customer_type'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # ── DealerOrder ────────────────────────────────────────────────────────
        migrations.CreateModel(
            name='DealerOrder',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('order_number', models.CharField(max_length=50, unique=True)),
                ('status', models.CharField(
                    choices=[
                        ('draft', 'Draft'), ('submitted', 'Submitted'), ('approved', 'Approved'),
                        ('rejected', 'Rejected'), ('dispatched', 'Dispatched'), ('received', 'Received'),
                    ],
                    default='draft', max_length=20,
                )),
                ('notes', models.TextField(blank=True)),
                ('rejection_reason', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('customer', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='dealer_orders', to='sales.customer')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='created_dealer_orders', to=settings.AUTH_USER_MODEL)),
                ('approved_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='approved_dealer_orders', to=settings.AUTH_USER_MODEL)),
            ],
            options={'db_table': 'dealer_orders', 'ordering': ['-created_at']},
        ),
        migrations.CreateModel(
            name='DealerOrderItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('requested_quantity', models.DecimalField(decimal_places=4, max_digits=14)),
                ('approved_quantity', models.DecimalField(blank=True, decimal_places=4, max_digits=14, null=True)),
                ('order', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='items', to='dispatch.dealerorder')),
                ('finished_product_variant', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='dealer_order_items', to='master_data.finishedproductvariant')),
            ],
            options={'db_table': 'dealer_order_items'},
        ),

        # ── DealerSale ────────────────────────────────────────────────────────
        migrations.CreateModel(
            name='DealerSale',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('sale_number', models.CharField(max_length=50, unique=True)),
                ('buyer_name', models.CharField(blank=True, max_length=255)),
                ('sale_date', models.DateField()),
                ('notes', models.TextField(blank=True)),
                ('is_confirmed', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('customer', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='dealer_sales', to='sales.customer')),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='dealer_sales_created', to=settings.AUTH_USER_MODEL)),
            ],
            options={'db_table': 'dealer_sales', 'ordering': ['-created_at']},
        ),
        migrations.CreateModel(
            name='DealerSaleItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('quantity', models.DecimalField(decimal_places=4, max_digits=14)),
                ('sale', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='items', to='dispatch.dealersale')),
                ('finished_product_variant', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='dealer_sale_items', to='master_data.finishedproductvariant')),
            ],
            options={'db_table': 'dealer_sale_items'},
        ),

        # ── DispatchOrder modifications ────────────────────────────────────────
        migrations.AddField(
            model_name='dispatchorder',
            name='dealer_order',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='dispatches', to='dispatch.dealerorder'),
        ),
        migrations.RemoveField(model_name='dispatchorder', name='invoice'),
        migrations.RemoveField(model_name='dispatchorder', name='packed_by'),
        migrations.RemoveField(model_name='dispatchorder', name='rechecked_by'),
        migrations.AlterField(
            model_name='dispatchorder',
            name='status',
            field=models.CharField(
                choices=[
                    ('draft', 'Draft'), ('dispatched', 'Dispatched'),
                    ('received', 'Received'), ('rejected', 'Rejected'), ('cancelled', 'Cancelled'),
                ],
                default='draft', max_length=20,
            ),
        ),

        # ── DispatchItem modifications ────────────────────────────────────────
        migrations.RemoveField(model_name='dispatchitem', name='lpn'),
        migrations.RemoveField(model_name='dispatchitem', name='source_location'),
        migrations.RemoveField(model_name='dispatchitem', name='packed_quantity'),
        migrations.RemoveField(model_name='dispatchitem', name='rechecked_quantity'),
        migrations.RenameField(
            model_name='dispatchitem',
            old_name='planned_quantity',
            new_name='quantity',
        ),

        # ── DealerStock modifications ─────────────────────────────────────────
        migrations.AlterUniqueTogether(
            name='dealerstock',
            unique_together=set(),
        ),
        migrations.RemoveField(model_name='dealerstock', name='batch'),
        migrations.AlterUniqueTogether(
            name='dealerstock',
            unique_together={('customer', 'finished_product_variant')},
        ),
    ]
