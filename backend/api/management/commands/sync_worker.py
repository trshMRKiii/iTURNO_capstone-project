import logging
import time

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import BaseCommand

logger = logging.getLogger('sync')


class Command(BaseCommand):
    help = "Run sync_once on a loop until stopped (Ctrl+C). This is the LAN <-> Supabase sync worker."

    def add_arguments(self, parser):
        parser.add_argument('--interval', type=int, default=settings.SYNC_INTERVAL_SECONDS,
                             help='Seconds between cycles (defaults to settings.SYNC_INTERVAL_SECONDS).')

    def handle(self, *args, **options):
        interval = options['interval']
        self.stdout.write(f'Sync worker started, interval={interval}s. Ctrl+C to stop.')
        while True:
            try:
                call_command('sync_once')
            except Exception:
                # One bad cycle (e.g. Supabase down) must not kill the worker —
                # log it and try again next interval.
                logger.exception('sync cycle crashed')
            time.sleep(interval)
