import logging
from collections import defaultdict

from django.apps import apps
from django.conf import settings
from django.db.models import Max

from api.models import LOCAL_ADMIN_PK_BASE, PendingSetting

logger = logging.getLogger('sync')


def next_offline_pk(model):
    return max(model.objects.aggregate(top=Max('pk'))['top'] or 0, LOCAL_ADMIN_PK_BASE) + 1


def park(instance):
    PendingSetting.objects.update_or_create(
        model_label=instance._meta.label, obj_id=instance.pk, defaults={'is_delete': False})


def park_delete(model, pk):
    """Takes the pk captured before deleting: Django clears instance.pk afterwards."""
    PendingSetting.objects.update_or_create(model_label=model._meta.label, obj_id=pk, defaults={'is_delete': True})


def flush_settings():
    """Push parked saves and deletes to Supabase; leave them parked while it is unreachable."""
    from api.views.helpers import supabase_reachable
    if settings.DEBUG or not PendingSetting.objects.exists() or not supabase_reachable():
        return 0
    flushed = 0
    for pending in PendingSetting.objects.order_by('queued_at'):
        model = apps.get_model(pending.model_label)
        try:
            if pending.is_delete:
                model.objects.using('supabase').filter(pk=pending.obj_id).delete()
            else:
                row = model.objects.using('default').filter(pk=pending.obj_id).first()
                if row:
                    row.save(using='supabase')
        except Exception as exc:
            logger.warning('push failed for %s#%s: %s', pending.model_label, pending.obj_id, str(exc)[:500])
            continue
        pending.delete()
        flushed += 1
    return flushed


def pending_settings():
    """{model_label: {obj_id, ...}} of rows still parked."""
    parked = defaultdict(set)
    for label, obj_id in PendingSetting.objects.values_list('model_label', 'obj_id'):
        parked[label].add(obj_id)
    return parked
