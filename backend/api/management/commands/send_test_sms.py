from django.core.management.base import BaseCommand, CommandError

from api.sms import send_sms, SmsError


class Command(BaseCommand):
    help = 'Send a one-off SMS via PhilSMS to verify SMS_ENABLED/PHILSMS_API_TOKEN are set up correctly.'

    def add_arguments(self, parser):
        parser.add_argument('number', help='Recipient number, e.g. 09953658074')
        parser.add_argument('--message', default='This is a test message from North Central Terminal.')

    def handle(self, *args, **options):
        try:
            result = send_sms(options['number'], options['message'])
        except SmsError as exc:
            raise CommandError(f'Send failed: {exc}')

        if result is None:
            self.stdout.write(self.style.WARNING('SMS_ENABLED is False — nothing was sent, only logged.'))
        else:
            self.stdout.write(self.style.SUCCESS(f'Sent. Response: {result}'))
