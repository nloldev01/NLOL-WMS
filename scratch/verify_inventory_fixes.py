
import os
import sys
import decimal

# Add current directory to path
sys.path.append(os.getcwd())

# Setup django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'nlol_wms.settings')
django.setup()

from products_stock.models import ProductStockLog, ProductStock
from raw_materials_stock.models import RawMaterialStockLog, RawMaterialStock
from inventory_core.models import Batch
from master_data.models import Product, Location, RawMaterialAndConsumable
from django.db import transaction

def test_zero_quantity_block():
    print("Testing zero quantity block...")
    # This should be caught by serializers in real API usage, 
    # but let's test model-level create_movement which has the check too.
    p = Product.objects.first()
    l = Location.objects.first()
    
    try:
        ProductStockLog.create_movement(
            product=p,
            location=l,
            movement_type='production',
            quantity=0
        )
        print("FAILED: Model allowed 0 quantity")
    except Exception as e:
        print(f"SUCCESS: Caught error: {e}")

def test_batch_creation_rollback():
    print("\nTesting batch creation rollback on insufficient stock...")
    p = Product.objects.first()
    l = Location.objects.first()
    
    # Ensure current stock is 10 for this test
    stock, _ = ProductStock.objects.get_or_create(product=p, location=l, batch=None, defaults={'quantity': 10})
    stock.quantity = 10
    stock.save()
    
    # We try to outbound 20 (insufficient) while auto-generating a batch
    # We'll simulate the View logic here
    
    from inventory_core.services.batch_service import BatchService
    
    initial_batch_count = Batch.objects.count()
    
    try:
        with transaction.atomic():
            # Simulated View logic:
            batch_code = BatchService.generate_code(batch_type='PRD')
            new_batch = Batch.objects.create(
                batch_code=batch_code,
                batch_type='PRD',
                product=p
            )
            print(f"Temporary batch created: {new_batch.batch_code}")
            
            # This should fail due to insufficient stock
            ProductStockLog.create_movement(
                product=p,
                location=l,
                movement_type='sale',
                quantity=20,
                batch=new_batch
            )
    except Exception as e:
        print(f"Expected error caught: {e}")
    
    final_batch_count = Batch.objects.count()
    if initial_batch_count == final_batch_count:
        print("SUCCESS: Batch creation rolled back!")
    else:
        print(f"FAILED: Batch was not rolled back. Count grew by {final_batch_count - initial_batch_count}")

if __name__ == "__main__":
    test_zero_quantity_block()
    test_batch_creation_rollback()
