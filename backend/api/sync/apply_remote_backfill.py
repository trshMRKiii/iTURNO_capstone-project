import logging

from django.utils import timezone

from api.models import RemoteBackfillRequest
from api.views.backfill import _resolve_row, _create_ticket
from api.views.helpers import record_audit_log

logger = logging.getLogger('sync')


def apply_pending():
    """Apply every PENDING RemoteBackfillRequest sitting in Supabase through the
    same validation/creation path as a local manual backfill entry, then write
    the outcome back onto that same row (Supabase is the only place these
    requests live — nothing to reconcile locally beyond the Ticket itself)."""
    pending = list(
        RemoteBackfillRequest.objects.using('supabase').filter(status='PENDING').order_by('created_at')
    )
    applied = failed = 0
    for req in pending:
        # Claim the row first (atomic conditional UPDATE) so an overlapping sync
        # cycle — e.g. this one is still waiting on Supabase network I/O when the
        # next scheduled tick starts — can't pick up and double-process the same
        # request.
        claimed = RemoteBackfillRequest.objects.using('supabase').filter(
            pk=req.pk, status='PENDING',
        ).update(status='PROCESSING')
        if not claimed:
            continue

        resolved, outcome, reason = _resolve_row(req.payload, existing_ids_in_batch=set())
        if outcome == 'ok':
            try:
                ticket = _create_ticket(resolved)
                record_audit_log(
                    user=None, action='CREATE', model_name='Ticket',
                    object_id=ticket.pk, object_repr=f"Remote backfill: {ticket}",
                    changes={'source': 'remote_backfill', 'requested_by': req.requested_by_name},
                )
                req.status = 'APPLIED'
                req.result_reason = ''
                applied += 1
            except Exception as exc:
                req.status = 'FAILED'
                req.result_reason = f"Save failed: {exc}"[:500]
                failed += 1
        elif outcome == 'duplicate':
            # The ticket already exists. The submission endpoint now rejects a second
            # genuine request for the same ticket number (see the dedup check in
            # api/remote/settings/[resource].js), so the remaining way to land here is
            # a previous cycle that created the Ticket but crashed/lost connectivity
            # before writing PENDING -> APPLIED back onto this row — treat that as
            # success instead of a permanent, misleading FAILED.
            req.status = 'APPLIED'
            req.result_reason = 'Already applied (ticket already existed on retry).'
            applied += 1
        else:
            req.status = 'FAILED'
            req.result_reason = reason or outcome
            failed += 1
        req.applied_at = timezone.now()
        req.save(using='supabase')

    if pending:
        logger.info('remote backfill: %s applied, %s failed', applied, failed)
    return applied, failed
