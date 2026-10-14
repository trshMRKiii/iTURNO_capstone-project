import logging
from smtplib import SMTPException

from django.conf import settings

from api.models import PendingAccountEmail, User
from api.sync.settings_outbox import pending_settings

logger = logging.getLogger('sync')


def queue_account_email(user, temp_password):
    PendingAccountEmail.objects.update_or_create(user_id=user.pk, defaults={'temp_password': temp_password})


def flush_account_emails():
    """Send parked login emails; leave them parked while mail or Supabase is unreachable.
    An account created offline is skipped until it has been pushed to Supabase, so the
    emailed credentials work the moment the person tries them."""
    from api.views.helpers import supabase_reachable, remote_db
    from api.views.viewsets import send_new_account_email
    if not PendingAccountEmail.objects.exists() or not (settings.DEBUG or supabase_reachable()):
        return 0
    unpushed = pending_settings()[User._meta.label]
    sent = 0
    for pending in PendingAccountEmail.objects.order_by('queued_at'):
        if pending.user_id in unpushed:
            continue
        user = User.objects.using(remote_db()).filter(pk=pending.user_id).first()
        if user:
            try:
                send_new_account_email(user, pending.temp_password)
            except (OSError, SMTPException) as exc:
                logger.warning('account email failed for user#%s: %s', pending.user_id, str(exc)[:500])
                break
        pending.delete()
        sent += 1
    return sent
