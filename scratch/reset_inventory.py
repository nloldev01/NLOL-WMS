import os
import django

import sys

# Add project root to sys.path
sys.path.append(os.getcwd())

# Setup Django environment
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'nlol_wms.settings')
django.setup()

from raw_materials_stock.models import RawMaterialStock, RawMaterialStockLog
from products_stock.models import ProductStock, ProductStockLog
from inventory_core.models import Batch, BatchCounter, LPN, LPNCounter

def reset_inventory():
    """
    Wipes all inventory-related data to allow for a clean start
    with the new batch numbering system.
    """
    print("--- Starting Inventory Reset ---")
    
    # 1. Clear Raw Material Logs and Snapshots
    print("Cleaning Raw Material Stock Logs...")
    RawMaterialStockLog.objects.all().delete()
    
    print("Cleaning Raw Material Stock snapshots...")
    RawMaterialStock.objects.all().delete()

    # 2. Clear Product Logs and Snapshots
    print("Cleaning Product Stock Logs...")
    ProductStockLog.objects.all().delete()
    
    print("Cleaning Product Stock snapshots...")
    ProductStock.objects.all().delete()

    # 3. Clear LPNs, Batches and Daily Counters
    print("Cleaning LPNs...")
    LPN.objects.all().delete()

    print("Cleaning Batches...")
    Batch.objects.all().delete()
    
    print("Cleaning Daily Batch Counters...")
    BatchCounter.objects.all().delete()

    print("Resetting Global LPN Counter...")
    LPNCounter.objects.all().delete()

    print("--- Inventory Reset Complete! ---")
    print("You can now start recording movements with the new A00-A99 sequence.")

if __name__ == "__main__":
    reset_inventory()
