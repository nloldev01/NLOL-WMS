import os
import django
from decimal import Decimal

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'nlol_wms.settings')
django.setup()

from master_data.models import Product, Location
from inventory_core.models import Batch, BatchCounter
from products_stock.models import ProductStockLog, ProductStock
from inventory_core.services.batch_service import BatchService
from django.contrib.auth import get_user_model

User = get_user_model()

def test_record():
    product = Product.objects.first()
    location = Location.objects.first()
    user = User.objects.first()
    
    if not product or not location or not user:
        print("Master data missing. Run migrations/seed first.")
        return

    print(f"Using Product: {product.name} (ID: {product.id})")
    print(f"Using Location: {location.name} (ID: {location.id})")

    # Simulate auto_generate=True, batch=None
    batch_code = BatchService.generate_code(batch_type='PRD')
    print(f"Generated Code: {batch_code}")
    
    batch = Batch.objects.create(
        batch_code=batch_code,
        batch_type='PRD',
        product=product
    )
    print(f"Created Batch ID: {batch.id}")

    log = ProductStockLog.create_movement(
        product=product,
        location=location,
        movement_type='production',
        quantity=Decimal('10.00'),
        batch=batch,
        performed_by=user
    )
    print(f"Created Log ID: {log.id}")

    # Verify batch exists in DB
    found = Batch.objects.filter(product=product).exists()
    print(f"Batch found for product? {found}")
    
    if found:
        b = Batch.objects.get(product=product, batch_code=batch_code)
        print(f"Verified Batch: {b.batch_code}")
    else:
        print("ERROR: Batch not found!")

if __name__ == "__main__":
    test_record()
