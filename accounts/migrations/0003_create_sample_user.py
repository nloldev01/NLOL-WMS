from django.db import migrations
from django.contrib.auth.hashers import make_password


def create_sample_user(apps, schema_editor):
    User = apps.get_model('accounts', 'User')
    UserRole = apps.get_model('accounts', 'UserRole')

    # Get or create admin role
    admin_role, _ = UserRole.objects.get_or_create(role='admin')

    # Create sample admin user
    User.objects.get_or_create(
        username='admin',
        defaults={
            'fullname': 'System Administrator',
            'email': 'admin@nlol.com',
            'password': make_password('admin123'),
            'user_role': admin_role,
            'status': 'active',  # Use string value instead of constant
        }
    )


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0002_seed_roles'),
    ]

    operations = [
        migrations.RunPython(create_sample_user),
    ]