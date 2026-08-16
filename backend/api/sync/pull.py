import logging

from api.sync.registry import PULL_MODELS

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
        stale_count = stale.count()
        if stale_count:
            stale.delete()
            deleted += stale_count
            logger.info('pull removed %s local %s row(s) no longer on supabase', stale_count, model._meta.label)

    logger.info('pull cycle: %s pulled, %s deleted, %s failed', pulled, deleted, failed)
    return pulled, deleted, failed
