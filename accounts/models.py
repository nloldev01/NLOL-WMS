from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager


class UserRole(models.Model):
    role = models.CharField(max_length=150, unique=True)

    class Meta:
        db_table = 'user_role'
        verbose_name = 'User Role'
        verbose_name_plural = 'User Roles'

    def __str__(self):
        return self.role


class SystemModule(models.Model):
    key        = models.CharField(max_length=50, unique=True)
    label      = models.CharField(max_length=100)
    description= models.CharField(max_length=255, blank=True)
    sort_order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        db_table = 'system_modules'
        ordering = ['sort_order', 'label']

    def __str__(self):
        return self.label


class RoleModulePermission(models.Model):
    ACCESS_CHOICES = [('none','No Access'),('view','View Only'),('full','Full Access')]
    role   = models.ForeignKey(UserRole, on_delete=models.CASCADE, related_name='module_permissions')
    module = models.ForeignKey(SystemModule, on_delete=models.CASCADE, related_name='role_permissions')
    access = models.CharField(max_length=10, choices=ACCESS_CHOICES, default='none')

    class Meta:
        db_table = 'role_module_permissions'
        unique_together = ('role', 'module')

    def __str__(self):
        return f"{self.role.role} → {self.module.key}: {self.access}"


class UserManager(BaseUserManager):
    def create_user(self, username, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email is required')
        email = self.normalize_email(email)
        user = self.model(username=username, email=email, **extra_fields)
        user.set_password(password)  # automatically hashes
        user.save(using=self._db)
        return user


class User(AbstractBaseUser):
    STATUS_BLOCKED = 'blocked'
    STATUS_ACTIVE = 'active'

    STATUS_CHOICES = [
        (STATUS_BLOCKED, 'Blocked'),
        (STATUS_ACTIVE, 'Active'),
    ]

    fullname = models.CharField(max_length=255)
    username = models.CharField(max_length=150, unique=True)
    email = models.EmailField(unique=True)
    user_role = models.ForeignKey(UserRole, on_delete=models.PROTECT, related_name='users')
    phone = models.CharField(max_length=10, null=True, blank=True)
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default=STATUS_ACTIVE)
    last_login_date = models.DateTimeField(null=True, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    otp_base32_secret = models.CharField(max_length=32, null=True, blank=True)
    is_2fa_enabled = models.BooleanField(default=False)


    USERNAME_FIELD = 'username'
    REQUIRED_FIELDS = ['email']

    objects = UserManager()

    class Meta:
        db_table = 'users'
        verbose_name = 'User'
        verbose_name_plural = 'Users'

    def __str__(self):
        return self.username


class BackupJob(models.Model):
    TRIGGER_CHOICES = [('manual', 'Manual'), ('scheduled', 'Scheduled')]
    STATUS_CHOICES  = [('running', 'Running'), ('success', 'Success'), ('failed', 'Failed')]

    trigger       = models.CharField(max_length=10, choices=TRIGGER_CHOICES)
    status        = models.CharField(max_length=10, choices=STATUS_CHOICES, default='running')
    file_name     = models.CharField(max_length=255, blank=True)
    file_size     = models.BigIntegerField(null=True, blank=True)
    triggered_by  = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL, related_name='backup_jobs')
    started_at    = models.DateTimeField(auto_now_add=True)
    completed_at  = models.DateTimeField(null=True, blank=True)
    error_message = models.TextField(blank=True)

    class Meta:
        db_table = 'system_backup_jobs'
        ordering = ['-started_at']

    def __str__(self):
        return f"Backup #{self.pk} ({self.trigger}, {self.status})"