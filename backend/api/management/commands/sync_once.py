import logging

from django.core.management.base import BaseCommand

from api.sync.pull import pull_all
from api.sync.push import push_pending

logger = logging.getLogger('sync')


class Command(BaseCommand):
    help = 'Run one pull-then-push sync cycle against the Supabase mirror.'

    def add_arguments(self, parser):
        parser.add_argument('--batch-size', type=int, default=None,
                             help='Max rows to push this cycle (defaults to settings.SYNC_BATCH_SIZE).')

    def handle(self, *args, **options):
        # Pull first: push may need FK targets (Route, User, ...) that only
        # exist locally once this cycle's pull has landed them.
        pulled, deleted, pull_failed = pull_all()
        pushed, push_failed = push_pending(batch_size=options['batch_size'])

        msg = (f'sync cycle: pulled={pulled} deleted={deleted} (failed={pull_failed}) '
               f'pushed={pushed} (failed={push_failed})')
        self.stdout.write(self.style.SUCCESS(msg))
