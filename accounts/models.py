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


    USERNAME_FIELD = 'username'
    REQUIRED_FIELDS = ['email']

    objects = UserManager()

    class Meta:
        db_table = 'users'
        verbose_name = 'User'
        verbose_name_plural = 'Users'

    def __str__(self):
        return self.username