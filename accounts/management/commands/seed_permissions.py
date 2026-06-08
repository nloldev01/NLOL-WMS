from django.core.management.base import BaseCommand
from accounts.models import UserRole, SystemModule, RoleModulePermission

MODULES = [
    {'key': 'dashboard',             'label': 'Dashboard',                'sort_order': 1},
    {'key': 'master_data',           'label': 'Master Data',              'sort_order': 2},
    {'key': 'users',                 'label': 'User Management',          'sort_order': 3},
    {'key': 'raw_material_stock',    'label': 'Raw Material Stock',       'sort_order': 4},
    {'key': 'base_product_stock',    'label': 'Base Product Stock',       'sort_order': 5},
    {'key': 'production',            'label': 'Production',               'sort_order': 6},
    {'key': 'assembly',              'label': 'Assembly Line',            'sort_order': 7},
    {'key': 'packaging',             'label': 'Packaging / Finished Products', 'sort_order': 8},
    {'key': 'finished_product_stock','label': 'FP Stock & Movements',     'sort_order': 9},
    {'key': 'sales',                 'label': 'Sales',                    'sort_order': 10},
    {'key': 'inventory_tools',       'label': 'Inventory Tools (LPN/Batches/Explorer)', 'sort_order': 11},
    {'key': 'production_recipes',    'label': 'Production Recipes (Restricted)',         'sort_order': 12},
]

# Default access matrix: role_key → {module_key: access_level}
DEFAULTS = {
    'superadmin': {m['key']: 'full' for m in MODULES},
    'admin': {
        'dashboard':              'full',
        'master_data':            'full',
        'users':                  'none',
        'raw_material_stock':     'full',
        'base_product_stock':     'full',
        'production':             'full',
        'assembly':               'full',
        'packaging':              'full',
        'finished_product_stock': 'full',
        'sales':                  'full',
        'inventory_tools':        'full',
        'production_recipes':     'none',
    },
    'production': {
        'dashboard':              'view',
        'master_data':            'none',
        'users':                  'none',
        'raw_material_stock':     'full',
        'base_product_stock':     'full',
        'production':             'full',
        'assembly':               'none',
        'packaging':              'none',
        'finished_product_stock': 'none',
        'sales':                  'none',
        'inventory_tools':        'view',
        'production_recipes':     'full',
    },
    'assembly': {
        'dashboard':              'view',
        'master_data':            'none',
        'users':                  'none',
        'raw_material_stock':     'none',
        'base_product_stock':     'none',
        'production':             'none',
        'assembly':               'full',
        'packaging':              'full',
        'finished_product_stock': 'full',
        'sales':                  'none',
        'inventory_tools':        'view',
        'production_recipes':     'none',
    },
    'user': {
        'dashboard':              'view',
        'master_data':            'none',
        'users':                  'none',
        'raw_material_stock':     'none',
        'base_product_stock':     'none',
        'production':             'none',
        'assembly':               'none',
        'packaging':              'none',
        'finished_product_stock': 'none',
        'sales':                  'none',
        'inventory_tools':        'none',
        'production_recipes':     'none',
    },
    'sales': {
        'dashboard':              'view',
        'master_data':            'none',
        'users':                  'none',
        'raw_material_stock':     'none',
        'base_product_stock':     'none',
        'production':             'none',
        'assembly':               'none',
        'packaging':              'none',
        'finished_product_stock': 'view',
        'sales':                  'full',
        'inventory_tools':        'view',
        'production_recipes':     'none',
    },
    'warehouse': {
        'dashboard':              'view',
        'master_data':            'none',
        'users':                  'none',
        'raw_material_stock':     'full',
        'base_product_stock':     'full',
        'production':             'view',
        'assembly':               'view',
        'packaging':              'view',
        'finished_product_stock': 'full',
        'sales':                  'none',
        'inventory_tools':        'full',
        'production_recipes':     'none',
    },
    'manager': {
        'dashboard':              'view',
        'master_data':            'view',
        'users':                  'none',
        'raw_material_stock':     'view',
        'base_product_stock':     'view',
        'production':             'view',
        'assembly':               'view',
        'packaging':              'view',
        'finished_product_stock': 'view',
        'sales':                  'view',
        'inventory_tools':        'view',
        'production_recipes':     'view',
    },
}


class Command(BaseCommand):
    help = 'Seed system modules and default role permissions'

    def add_arguments(self, parser):
        parser.add_argument('--reset', action='store_true', help='Reset all permissions to defaults')

    def handle(self, *args, **options):
        # 1. Upsert all system modules
        for m in MODULES:
            SystemModule.objects.update_or_create(key=m['key'], defaults={'label': m['label'], 'sort_order': m['sort_order']})
        self.stdout.write(f'  OK {len(MODULES)} system modules seeded')

        # 2. Ensure default roles exist
        for role_key in DEFAULTS:
            UserRole.objects.get_or_create(role=role_key)

        # 3. Create/update default permissions
        created = updated = 0
        for role_key, module_map in DEFAULTS.items():
            try:
                role = UserRole.objects.get(role=role_key)
            except UserRole.DoesNotExist:
                continue
            for module_key, access in module_map.items():
                try:
                    module = SystemModule.objects.get(key=module_key)
                except SystemModule.DoesNotExist:
                    continue
                perm, was_created = RoleModulePermission.objects.get_or_create(
                    role=role, module=module,
                    defaults={'access': access},
                )
                if not was_created and options['reset']:
                    perm.access = access
                    perm.save()
                    updated += 1
                elif was_created:
                    created += 1

        self.stdout.write(f'  OK {created} permissions created, {updated} reset to defaults')
        self.stdout.write(self.style.SUCCESS('Permission seeding complete.'))
