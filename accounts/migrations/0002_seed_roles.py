from django.db import migrations


def create_default_roles(apps, schema_editor):
    UserRole = apps.get_model('accounts', 'UserRole')
    UserRole.objects.get_or_create(role='admin')
    UserRole.objects.get_or_create(role='user')


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(create_default_roles),
    ]
