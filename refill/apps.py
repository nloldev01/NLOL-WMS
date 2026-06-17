from django.apps import AppConfig


class RefillConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'refill'

    def ready(self):
        import refill.signals  # noqa: F401
