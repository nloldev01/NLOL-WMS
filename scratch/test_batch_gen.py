import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'nlol_wms.settings')
django.setup()

from inventory_core.services.batch_service import BatchService
from inventory_core.models import BatchCounter

def test_gen():
    print("Testing RAW batch generation...")
    # Generate a few batches
    code1 = BatchService.generate_code('RAW')
    code2 = BatchService.generate_code('RAW')
    
    print(f"Batch 1: {code1}")
    print(f"Batch 2: {code2}")
    
    if "A00" in code1 and "A01" in code2:
        print("SUCCESS: Sequence starts at 00 and increments correctly.")
    else:
        print("FAILURE: Incorrect sequence.")

    # Test wrap around to B00 (simulated)
    # We need to manually set the counter to 99
    counter = BatchCounter.objects.get(batch_type='RAW')
    counter.number = 99
    counter.save()
    
    code_99 = BatchService.generate_code('RAW')
    code_next = BatchService.generate_code('RAW')
    
    print(f"Batch at 99: {code_99}")
    print(f"Batch after 99: {code_next}")
    
    if "A99" in code_99 and "B00" in code_next:
        print("SUCCESS: Sequence wraps correctly from A99 to B00.")
    else:
        print("FAILURE: Incorrect wrap around.")

if __name__ == "__main__":
    test_gen()
