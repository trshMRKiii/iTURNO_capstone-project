from django.core.management.base import BaseCommand

from api.models import Ticket
from api.views.overstays import ROAM_LIMIT_MINUTES, overstay_minutes, queue_allowance


class Command(BaseCommand):
    help = "Fills Ticket.overstay_minutes for visits dispatched before it was recorded (safe to re-run)."

    def handle(self, *args, **options):
        groups = {}
        for t in Ticket.objects.filter(status='COLLECTED', dispatched_at__isnull=False).select_related('route'):
            if t.mode == 'QUEUE' and t.loading_started_at:
                over = overstay_minutes(t.dispatched_at - t.loading_started_at, queue_allowance(t.route, t.extra_loading_minutes))
            elif t.mode == 'UNLOAD' and t.checked_in_at and t.checked_out_at:
                over = overstay_minutes(t.checked_out_at - t.checked_in_at, ROAM_LIMIT_MINUTES)
            else:
                continue
            if over != t.overstay_minutes:
                groups.setdefault(over, []).append(t.pk)
        for over, ids in groups.items():
            Ticket.objects.filter(pk__in=ids).update(overstay_minutes=over)
        self.stdout.write(f"Updated {sum(map(len, groups.values()))} tickets.")
