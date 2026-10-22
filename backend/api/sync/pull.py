import logging

from django.conf import settings

from api.models import LOCAL_ADMIN_PK_BASE, User
from api.sync.account_emails import flush_account_emails
from api.sync.fleet_access import flush_fleet_access, pending_fleet_access
from api.sync.registry import PULL_MODELS
from api.sync.settings_outbox import flush_settings, pending_settings

logger = logging.getLogger('sync')


def pull_all():
    """Refresh the LAN's local cache of admin/manager-owned models.

    These tables (User, Route, pricing, etc.) are small, so this just
    fetches everything from Supabase each cycle rather than tracking deltas.
    Supabase is the only writer for these models, so there's nothing to
    reconcile — each row here just overwrites the LAN's cached copy, and a
    local row whose id no longer appears on Supabase gets removed too (admin
    deleted it remotely). Every affected model's user-facing FK is SET_NULL
    (see Ticket.active_user, Requisition.requested_by), so a remote deletion
    can never cascade into destroying local transaction history.

    If a model's fetch from Supabase fails (unreachable, not migrated yet,
    etc.), that model is skipped for this cycle — including its deletion
    check — so a network blip can never be misread as "everything was
    deleted remotely." The LAN just keeps whatever it cached last cycle.

    Same guard for a *successful* fetch that comes back empty while the LAN
    still has rows: that's far more likely to mean Supabase hasn't been
    seeded yet (see seed_supabase) than "admin deleted every row," so the
    deletion check is skipped for that model rather than wiping the local
    table out.
    """
    pulled, deleted, failed = 0, 0, 0
    flush_fleet_access()
    pending_fleet = pending_fleet_access()  # ticks still parked: keep them over the pulled copy
    flush_settings()
    flush_account_emails()  # after flush_settings: offline-created accounts must reach Supabase first
    pending = pending_settings()  # settings rows still parked: local copy wins, never deleted as stale
    # DEBUG staff edits are written locally only (see remote_db) and never pushed, so a pull
    # that overwrote existing local users would silently revert them every cycle.
    keep_local_users = set(User.objects.using('default').values_list('pk', flat=True)) if settings.DEBUG else set()
    for model in PULL_MODELS:
        try:
            objects = list(model.objects.using('supabase').all())
        except Exception as exc:
            failed += 1
            logger.warning('pull failed to fetch %s: %s', model._meta.label, str(exc)[:500])
            continue

        remote_ids = set()
        for instance in objects:
            remote_ids.add(instance.pk)
            if instance.pk in pending[model._meta.label] or (model is User and instance.pk in keep_local_users):
                continue
            if model is User and instance.pk in pending_fleet:
                instance.can_manage_fleet = pending_fleet[instance.pk]
            try:
                instance.save(using='default')
                pulled += 1
            except Exception as exc:
                failed += 1
                logger.warning('pull failed for %s#%s: %s', model._meta.label, instance.pk, str(exc)[:500])

        local_count = model.objects.using('default').count()
        if not remote_ids and local_count:
            # Supabase returned zero rows for a model that has local data.
            # That's far more likely to mean "not seeded yet" or an auth/
            # connectivity hiccup than "admin deleted every single row" —
            # never let an empty fetch wipe out an entire local table.
            logger.warning(
                'pull: supabase has 0 %s rows but LAN has %s - skipping delete-check '
                '(treating as not-seeded/unreachable, not a real mass-delete)',
                model._meta.label, local_count)
            continue

        stale = model.objects.using('default').exclude(pk__in=remote_ids)
        if model is User:
            # Local superusers (createsuperuser) exist so the LAN stays
            # administrable offline; they were never on Supabase by design.
            stale = stale.exclude(pk__gt=LOCAL_ADMIN_PK_BASE)
        stale = stale.exclude(pk__in=pending[model._meta.label])
        stale_count = stale.count()
        if stale_count:
            stale.delete()
            deleted += stale_count
            logger.info('pull removed %s local %s row(s) no longer on supabase', stale_count, model._meta.label)

    logger.info('pull cycle: %s pulled, %s deleted, %s failed', pulled, deleted, failed)
    return pulled, deleted, failed
