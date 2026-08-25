"""Push the entire SyncQueue backlog to Supabase right now, back-to-back,
instead of waiting on sync_worker's 30s-per-cycle loop. Useful after a bulk
seed/backfill queues up thousands of rows at once.
"""
from django.core.management.base import BaseCommand

from api.models import SyncQueue
from api.sync.push import push_pending


class Command(BaseCommand):
    help = "Drain SyncQueue to Supabase in a tight loop until empty."

    def add_arguments(self, parser):
        parser.add_argument("--batch-size", type=int, default=500)

    def handle(self, *args, **options):
        batch_size = options["batch_size"]
        cycle = 0
        total_pushed = total_failed = 0
        while True:
            remaining = SyncQueue.objects.filter(synced_at__isnull=True).count()
            if remaining == 0:
                break
            pushed, failed = push_pending(batch_size=batch_size)
            total_pushed += pushed
            total_failed += failed
            cycle += 1
            if pushed == 0 and failed == 0:
                self.stdout.write(self.style.WARNING(
                    "push_pending() pushed nothing this cycle (DEBUG=True skips pushing entirely) -- stopping."
                ))
                break
            if cycle % 10 == 0 or remaining <= batch_size:
                self.stdout.write(f"cycle {cycle}: {remaining} remaining, {total_pushed} pushed so far, {total_failed} failed so far")
        self.stdout.write(self.style.SUCCESS(
            f"Done. {total_pushed} pushed, {total_failed} failed across {cycle} cycles."
        ))
