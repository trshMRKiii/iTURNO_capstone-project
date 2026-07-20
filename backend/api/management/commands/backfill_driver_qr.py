from django.core.management.base import BaseCommand
from api.models import Driver


class Command(BaseCommand):
    help = "Set qr_code = iwp_number for drivers whose QR code is blank or out of sync"

    def handle(self, *args, **options):
        updated = 0
        for driver in Driver.objects.exclude(iwp_number=""):
            if driver.qr_code != driver.iwp_number:
                driver.qr_code = driver.iwp_number
                driver.save(update_fields=["qr_code"])
                updated += 1
        self.stdout.write(self.style.SUCCESS(f"Updated {updated} driver(s)."))
