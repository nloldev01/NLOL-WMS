import django, os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'nlol_wms.settings')
django.setup()
from master_data.models import ProductSubGroup
for sg in ProductSubGroup.objects.all().order_by('group__name', 'name'):
    group_name = sg.group.name if sg.group else 'None'
    print(f"ID:{sg.id} | Group:{group_name} | Name:{sg.name}")
