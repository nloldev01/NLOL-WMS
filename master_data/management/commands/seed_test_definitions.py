from django.core.management.base import BaseCommand
from master_data.models import Parameter, TestDefinition, TestDefinitionParameter

# Parameter catalog. New formats add rows here, never new code.
PARAMETERS = [
    {'code': 'P001', 'name': 'Appearance',               'default_method': 'Visual',     'default_unit': '',      'value_type': 'text'},
    {'code': 'P002', 'name': 'ASTM Colour',               'default_method': 'ASTM D1500', 'default_unit': '',      'value_type': 'bounded'},
    {'code': 'P003', 'name': 'Density At 29.5°C',         'default_method': 'ASTM D4052', 'default_unit': 'g/ml',  'value_type': 'numeric'},
    {'code': 'P005', 'name': 'Kinematic Viscosity At 40°C',  'default_method': 'ASTM D445', 'default_unit': 'mm2/s', 'value_type': 'numeric'},
    {'code': 'P006', 'name': 'Kinematic Viscosity At 100°C', 'default_method': 'ASTM D445', 'default_unit': 'mm2/s', 'value_type': 'numeric'},
    {'code': 'P007', 'name': 'Viscosity Index',           'default_method': 'ASTM D2270', 'default_unit': '',      'value_type': 'numeric'},
    {'code': 'P008', 'name': 'Flash Point - COC',         'default_method': 'ASTM D92',   'default_unit': '°C',    'value_type': 'numeric'},
    {'code': 'P009', 'name': 'Thickener',                 'default_method': '-',          'default_unit': '',      'value_type': 'text'},
    {'code': 'P010', 'name': 'Colour',                    'default_method': '-',          'default_unit': '',      'value_type': 'text'},
    {'code': 'P011', 'name': 'Worked Penetration',        'default_method': 'ASTM D217',  'default_unit': '',      'value_type': 'numeric'},
    {'code': 'P012', 'name': 'Drop Point',                'default_method': 'ASTM D2265', 'default_unit': '°C',    'value_type': 'text'},
    {'code': 'P013', 'name': '4 Ball EP Load',            'default_method': 'ASTM D2596', 'default_unit': 'Kg',    'value_type': 'text'},
]

# T01 — Engine Oil COA, matching the sample report exactly (Sr.No order).
T01_ROWS = [
    {'param': 'P001', 'spec_type': 'Report', 'min': None,  'max': None,  'sort': 1},
    {'param': 'P002', 'spec_type': 'Max',    'min': None,  'max': 2.5,   'sort': 2},
    {'param': 'P003', 'spec_type': 'Report', 'min': None,  'max': None,  'sort': 3},
    {'param': 'P006', 'spec_type': 'Range',  'min': 13.90, 'max': 14.90, 'sort': 4},
    {'param': 'P005', 'spec_type': 'Report', 'min': None,  'max': None,  'sort': 5},
    {'param': 'P007', 'spec_type': 'Min',    'min': 120,   'max': None,  'sort': 6},
    {'param': 'P008', 'spec_type': 'Min',    'min': 200,   'max': None,  'sort': 7},
]

# T02 — Grease COA, matching the sample report. No limits shown on this format
# at all — every row is just recorded ('Report'); the QC call is the human-
# entered remarks (e.g. "QC OK"), not an engine-computed verdict.
T02_ROWS = [
    {'param': 'P001', 'spec_type': 'Report', 'min': None, 'max': None, 'sort': 1},
    {'param': 'P009', 'spec_type': 'Report', 'min': None, 'max': None, 'sort': 2},
    {'param': 'P010', 'spec_type': 'Report', 'min': None, 'max': None, 'sort': 3},
    {'param': 'P011', 'spec_type': 'Report', 'min': None, 'max': None, 'sort': 4},
    {'param': 'P012', 'spec_type': 'Report', 'min': None, 'max': None, 'sort': 5},
    {'param': 'P013', 'spec_type': 'Report', 'min': None, 'max': None, 'sort': 6},
]

TEST_DEFINITIONS = [
    {
        'code': 'T01', 'name': 'Engine Oil COA', 'category': 'Lubricants',
        'template': 'layout_A', 'rows': T01_ROWS,
    },
    {
        'code': 'T02', 'name': 'Grease COA', 'category': 'Grease',
        'template': 'layout_B', 'rows': T02_ROWS,
    },
]


class Command(BaseCommand):
    help = 'Seed the Parameter catalog and the First Fill Test report formats (Engine Oil COA, Grease COA).'

    def handle(self, *args, **options):
        for p in PARAMETERS:
            Parameter.objects.update_or_create(code=p['code'], defaults={
                'name': p['name'],
                'default_method': p['default_method'],
                'default_unit': p['default_unit'],
                'value_type': p['value_type'],
            })
        self.stdout.write(f'  OK {len(PARAMETERS)} parameters seeded')

        for td in TEST_DEFINITIONS:
            test_def, _ = TestDefinition.objects.update_or_create(code=td['code'], defaults={
                'name': td['name'],
                'category': td['category'],
                'template': td['template'],
                'is_active': True,
            })
            for row in td['rows']:
                TestDefinitionParameter.objects.update_or_create(
                    test=test_def, parameter=Parameter.objects.get(code=row['param']),
                    defaults={
                        'spec_type': row['spec_type'],
                        'min_value': row['min'],
                        'max_value': row['max'],
                        'mandatory': True,
                        'sort_order': row['sort'],
                    },
                )
            self.stdout.write(f"  OK {td['code']} ({td['name']}) seeded with {len(td['rows'])} parameters")

        self.stdout.write(self.style.SUCCESS('Test definition seeding complete.'))
