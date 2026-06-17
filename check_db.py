import django, os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'nlol_wms.settings')
django.setup()

from django.db import connection
with connection.cursor() as c:
    c.execute("""
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'master_raw_materials_and_consumables'
        ORDER BY ordinal_position
    """)
    for row in c.fetchall():
        print(row)

print("\nSample rows:")
from master_data.models import RawMaterialAndConsumable
for r in RawMaterialAndConsumable.objects.all()[:3]:
    print(r.__dict__)
