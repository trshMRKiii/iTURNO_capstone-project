from django.core.management.base import BaseCommand
from django.db import transaction

from api.models import Ticket, RemittanceBatch, AuditLog, RoamingLog, SyncQueue

# RemittanceBatch cascades to Deposit/Collection on both 'default' and
# 'supabase' (mirrored FK behavior), so they don't need to be listed here.
# Requisition/TicketSeries/Vehicle/Driver/User are intentionally excluded —
# TicketSeries.requisition is CASCADE, so wiping Requisition would take
# TicketSeries down with it.
SUPABASE_MODELS = [Ticket, RemittanceBatch, AuditLog]
LAN_ONLY_MODELS = [RoamingLog]
QUEUE_LABELS = ['api.Ticket', 'api.RemittanceBatch', 'api.Deposit', 'api.Collection', 'api.AuditLog']


class Command(BaseCommand):
    help = ('Debug-stage reset: deletes Ticket/RemittanceBatch(+Deposit/Collection)/AuditLog '
            'from both LAN (default) and Supabase (supabase), plus RoamingLog on LAN only. '
            'Leaves User/Driver/Vehicle/TicketSeries/Requisition untouched. Also clears the '
            'matching SyncQueue backlog so nothing is left queued for the wiped rows.')

    def add_arguments(self, parser):
        parser.add_argument('--yes', action='store_true', help='Actually perform the deletion (otherwise dry-run).')

    def handle(self, *args, **options):
        counts = {m.__name__: m.objects.using('default').count() for m in SUPABASE_MODELS + LAN_ONLY_MODELS}
        supabase_counts = {m.__name__: m.objects.using('supabase').count() for m in SUPABASE_MODELS}
        queue_count = SyncQueue.objects.filter(model_label__in=QUEUE_LABELS).count()

        self.stdout.write('LAN (default) row counts: %s' % counts)
        self.stdout.write('Supabase row counts: %s' % supabase_counts)
        self.stdout.write('Matching SyncQueue entries to clear: %s' % queue_count)

        if not options['yes']:
            self.stdout.write(self.style.WARNING('Dry run only — re-run with --yes to actually delete.'))
            return

        for model in SUPABASE_MODELS:
            with transaction.atomic(using='supabase'):
                model.objects.using('supabase').all().delete()
        for model in SUPABASE_MODELS + LAN_ONLY_MODELS:
            with transaction.atomic(using='default'):
                model.objects.using('default').all().delete()

        SyncQueue.objects.filter(model_label__in=QUEUE_LABELS).delete()

        self.stdout.write(self.style.SUCCESS('Wipe complete on both LAN and Supabase; matching SyncQueue backlog cleared.'))
