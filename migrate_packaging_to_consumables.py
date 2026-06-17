import django, os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'nlol_wms.settings')
django.setup()

from master_data.models import ProductSubGroup, RawMaterialAndConsumable

PACKAGING_IDS = [55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 90, 91, 92, 93, 94, 95, 96]

subgroups = ProductSubGroup.objects.filter(id__in=PACKAGING_IDS)

created = []
skipped = []
for sg in subgroups:
    exists = RawMaterialAndConsumable.objects.filter(name__iexact=sg.name, type='consumable').exists()
    if exists:
        skipped.append(sg.name)
    else:
        RawMaterialAndConsumable.objects.create(name=sg.name, type='consumable')
        created.append(sg.name)

print(f"\nCreated {len(created)} consumables:")
for n in created:
    print(f"  + {n}")

if skipped:
    print(f"\nSkipped {len(skipped)} (already exist as consumable):")
    for n in skipped:
        print(f"  ~ {n}")

deleted_count, _ = subgroups.delete()
print(f"\nDeleted {deleted_count} sub group entries.")
