from django.db import migrations


def add_superadmin_role(apps, schema_editor):
    UserRole = apps.get_model('accounts', 'UserRole')
    UserRole.objects.get_or_create(role='superadmin')


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0004_user_last_login_alter_user_password'),
    ]

    operations = [
        migrations.RunPython(add_superadmin_role),
    ]
