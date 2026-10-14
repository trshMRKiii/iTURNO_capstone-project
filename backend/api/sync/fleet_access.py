import logging

from django.conf import settings

from api.models import PendingFleetAccess, User

logger = logging.getLogger('sync')


def flush_fleet_access():
    """Push parked fleet-access ticks to Supabase; leave them parked while it is unreachable."""
    from api.views.helpers import supabase_reachable
    if settings.DEBUG or not PendingFleetAccess.objects.exists() or not supabase_reachable():
        return 0
    flushed = 0
    for pending in PendingFleetAccess.objects.all():
        try:
            User.objects.using('supabase').filter(pk=pending.user_id).update(can_manage_fleet=pending.can_manage_fleet)
        except Exception as exc:
            logger.warning('fleet access push failed for user#%s: %s', pending.user_id, str(exc)[:500])
            break
        pending.delete()
        flushed += 1
    return flushed


def pending_fleet_access():
    return dict(PendingFleetAccess.objects.values_list('user_id', 'can_manage_fleet'))
