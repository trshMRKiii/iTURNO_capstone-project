import random

from django.core.management.base import BaseCommand
from django.db import transaction

from api.models import Route, Vehicle

# Tanqui Terminal inter-municipal routes (San Fernando City, La Union).
TERMINAL_ROUTES = [
    "San Juan", "Bacnotan", "Luna", "San Gabriel",
    "Bauang", "Naguilian", "Bagulin", "Burgos",
]


class Command(BaseCommand):
    help = (
        "Restrict the Route table to the Tanqui Terminal route list. Any "
        "vehicle on a route being removed is reassigned to a random route "
        "from the new list. Run once per database: --using default (whichever "
        "of db.sqlite3 / db_production.sqlite3 DEBUG currently points at) and "
        "--using supabase."
    )

    def add_arguments(self, parser):
        parser.add_argument('--using', default='default')
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        alias = options['using']
        dry_run = options['dry_run']

        with transaction.atomic(using=alias):
            kept = []
            for origin in TERMINAL_ROUTES:
                route, created = Route.objects.using(alias).get_or_create(origin=origin)
                kept.append(route)
                if created:
                    self.stdout.write(f'[{alias}] created route: {origin}')

            stale = list(Route.objects.using(alias).exclude(origin__in=TERMINAL_ROUTES))
            affected = Vehicle.objects.using(alias).filter(route__in=stale)

            for vehicle in affected:
                new_route = random.choice(kept)
                self.stdout.write(
                    f'[{alias}] {vehicle.plate_number}: '
                    f'{vehicle.route.origin} -> {new_route.origin}'
                )
                if not dry_run:
                    vehicle.route = new_route
                    vehicle.save(using=alias, update_fields=['route'])

            stale_names = [r.origin for r in stale]
            if not dry_run:
                Route.objects.using(alias).filter(pk__in=[r.pk for r in stale]).delete()
            self.stdout.write(f'[{alias}] removed {len(stale_names)} route(s): {stale_names}')

            if dry_run:
                transaction.set_rollback(True, using=alias)
