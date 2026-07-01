from rest_framework.permissions import BasePermission, IsAuthenticated
from .models import RoleModulePermission

_ORDER = {'none': 0, 'view': 1, 'full': 2}


def _user_access_level(user, module_key):
    """Return the access level string ('none'/'view'/'full') for a user on a module."""
    if not user or not user.is_authenticated:
        return 'none'
    role = getattr(user, 'user_role', None)
    if not role:
        return 'none'
    perm = RoleModulePermission.objects.select_related('module').filter(
        role=role, module__key=module_key
    ).first()
    return perm.access if perm else 'none'


def has_module_access(user, module_key, min_access='view'):
    level = _user_access_level(user, module_key)
    return _ORDER.get(level, 0) >= _ORDER.get(min_access, 1)


def is_consumables_scoped(user):
    """True for the consumables_handler role, whose raw-material access is limited
    to consumable-type materials. Superadmin/admin/warehouse are unrestricted."""
    if not user or not user.is_authenticated:
        return False
    role = getattr(user, 'user_role', None)
    return bool(role and role.role == 'consumables_handler')


def get_user_permissions(user):
    """Return a dict of {module_key: access_level} for a user."""
    role = getattr(user, 'user_role', None)
    if not role:
        return {}
    perms = RoleModulePermission.objects.select_related('module').filter(role=role)
    return {p.module.key: p.access for p in perms}


class IsSuperAdmin(BasePermission):
    """Restrict access to superadmin users only — used for system-level operations like backups."""
    message = "Only superadmins can access this."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and getattr(user, 'user_role', None) and user.user_role.role == 'superadmin')


class IsConsumablesHandler(BasePermission):
    """Restrict approve/reject/dispatch/return of consumable requests to the dedicated handler role.

    Separation of duties: requesters (e.g. assembly) raise & submit requests, but only a
    'consumables_handler' (or superadmin) can act on them.
    """
    message = "Only the consumables handler can approve, reject, dispatch or close requests."

    def has_permission(self, request, view):
        user = request.user
        role = getattr(user, 'user_role', None)
        return bool(user and user.is_authenticated and role and role.role in ('consumables_handler', 'superadmin'))


class ModulePermission:
    """
    Factory that creates a DRF permission class list for a given module.

    Usage:
        permission_classes = ModulePermission.require('assembly')         # view+
        permission_classes = ModulePermission.require('assembly', 'full') # write
    """
    @staticmethod
    def require(module_key, min_access='view'):
        class _ModulePerm(BasePermission):
            message = f"You don't have access to this section."

            def has_permission(self, request, view):
                return has_module_access(request.user, module_key, min_access)

        return [IsAuthenticated, _ModulePerm]

    @staticmethod
    def read_write(module_key):
        """
        Allow GET/HEAD/OPTIONS for 'view', require 'full' for mutations.
        """
        class _ReadWritePerm(BasePermission):
            message = "You don't have sufficient access to this section."

            def has_permission(self, request, view):
                if request.method in ('GET', 'HEAD', 'OPTIONS'):
                    return has_module_access(request.user, module_key, 'view')
                return has_module_access(request.user, module_key, 'full')

        return [IsAuthenticated, _ReadWritePerm]
