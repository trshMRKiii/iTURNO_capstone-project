from django.apps import AppConfig


class ApiConfig(AppConfig):
    name = 'api'

    def ready(self):
        from api.ws import signals  # noqa: F401
        from api.sync import signals as sync_signals
        sync_signals.connect()
