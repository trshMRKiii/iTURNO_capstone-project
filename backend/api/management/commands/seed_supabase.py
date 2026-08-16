from django.core.management.base import BaseCommand

from api.sync.registry import PULL_MODELS


class Command(BaseCommand):
    help = (
        "One-time bootstrap: copy existing local reference data (User, Route, "
        "TicketPrice, TerminalPrice, TicketForm, PUVType) up to Supabase so it has "
        "a starting point. Never overwrites a row that already exists on Supabase — "
        "admin's remote edits always win, this only fills in what's missing. Run "
        "this once per model when setting up a new Supabase project or adding a new "
        "PULL_MODEL; the ongoing sync worker only pulls FROM Supabase after this."
    )

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                             help='Show what would be created without writing anything.')

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        total_created, total_skipped = 0, 0

        for model in PULL_MODELS:
            existing_ids = set(model.objects.using('supabase').values_list('pk', flat=True))
            created, skipped = 0, 0
            for obj in model.objects.using('default').all():
                if obj.pk in existing_ids:
                    skipped += 1
                    continue
                if not dry_run:
                    obj.save(using='supabase')
                created += 1
            total_created += created
            total_skipped += skipped
            self.stdout.write(f'{model._meta.label}: {created} to create, {skipped} already on Supabase (left untouched)')

        verb = 'would create' if dry_run else 'created'
        self.stdout.write(self.style.SUCCESS(f'{verb} {total_created} row(s) total, skipped {total_skipped} already present'))
        if dry_run:
            self.stdout.write(self.style.WARNING('Dry run - nothing was written. Re-run without --dry-run to apply.'))
