from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import F

from api.models import Ticket, RemittanceBatch, AuditLog, SyncQueue, Vehicle

# RemittanceBatch cascades to Deposit/Collection on both 'default' and
# 'supabase' (mirrored FK behavior), so they don't need to be listed here.
# Requisition/TicketSeries/Vehicle/Driver/User are intentionally excluded —
# TicketSeries.requisition is CASCADE, so wiping Requisition would take
# TicketSeries down with it.
SUPABASE_MODELS = [Ticket, RemittanceBatch, AuditLog]
QUEUE_LABELS = ['api.Ticket', 'api.RemittanceBatch', 'api.Deposit', 'api.Collection', 'api.AuditLog']


class Command(BaseCommand):
    help = ('Debug-stage reset: deletes Ticket/RemittanceBatch(+Deposit/Collection)/AuditLog '
            'from both LAN (default) and Supabase (supabase). '
            'Leaves User/Driver/Vehicle/TicketSeries/Requisition untouched (except resetting QUEUED vehicles to AVAILABLE). Also clears the '
            'matching SyncQueue backlog so nothing is left queued for the wiped rows.')

    def add_arguments(self, parser):
        parser.add_argument('--yes', action='store_true', help='Actually perform the deletion (otherwise dry-run).')

    def handle(self, *args, **options):
        counts = {m.__name__: m.objects.using('default').count() for m in SUPABASE_MODELS}
        supabase_counts = {m.__name__: m.objects.using('supabase').count() for m in SUPABASE_MODELS}
        queue_count = SyncQueue.objects.filter(model_label__in=QUEUE_LABELS).count()

        self.stdout.write('LAN (default) row counts: %s' % counts)
        self.stdout.write('Supabase row counts: %s' % supabase_counts)
        self.stdout.write('Matching SyncQueue entries to clear: %s' % queue_count)

        if not options['yes']:
            self.stdout.write(self.style.WARNING('Dry run only — re-run with --yes to actually delete.'))
            return

        for alias in ('supabase', 'default'):
            with transaction.atomic(using=alias):
                for model in SUPABASE_MODELS:
                    model.objects.using(alias).all().delete()
                # With every ticket gone, no vehicle can still be in line —
                # otherwise it stays QUEUED with no ticket (a "ghost" counted
                # by the dashboard but invisible in the queue).
                Vehicle.objects.using(alias).filter(status='QUEUED').update(
                    status='AVAILABLE', active_driver=F('owner_driver'))

        SyncQueue.objects.filter(model_label__in=QUEUE_LABELS).delete()

        self.stdout.write(self.style.SUCCESS('Wipe complete on both LAN and Supabase; matching SyncQueue backlog cleared.'))
