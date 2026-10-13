import logging

from django.utils import timezone

from api.models import RemoteBackfillRequest, BackfillRecord
from api.views.backfill import _resolve_batch, _reserve_and_create, run_batch, record_batch_history
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

        if 'rows' in req.payload:
            # A whole screen's batch (one request) - saved all-or-nothing, one history entry.
            try:
                results, ok = run_batch(req.payload['rows'], True)
            except Exception as exc:
                results, ok = [{'outcome': 'error', 'reason': f"Save failed: {exc}"}], False
            if ok:
                record_audit_log(
                    user=None, action='CREATE', model_name='Ticket',
                    object_id=','.join(i for r in results for i in r['ticket_ids']),
                    object_repr=f"Remote backfill: {sum(len(r['ticket_ids']) for r in results)} ticket(s)",
                    changes={'source': 'remote_backfill', 'requested_by': req.requested_by_name},
                )
                record_batch_history(req.payload['rows'], results, None, req.requested_by_name)
                req.status, req.result_reason = 'APPLIED', ''
                applied += 1
            else:
                bad = next(r for r in results if r['outcome'] != 'ok')
                req.status, req.result_reason = 'FAILED', (bad.get('reason') or 'error')[:500]
                failed += 1
            req.applied_at = timezone.now()
            req.save(using='supabase')
            continue

        resolved, outcome, reason = _resolve_batch(req.payload)
        if outcome == 'ok':
            try:
                tickets = _reserve_and_create(resolved)
                record_audit_log(
                    user=None, action='CREATE', model_name='Ticket',
                    object_id=','.join(t.pk for t in tickets), object_repr=f"Remote backfill: {len(tickets)} ticket(s)",
                    changes={'source': 'remote_backfill', 'requested_by': req.requested_by_name},
                )
                BackfillRecord.objects.create(
                    ticket_count=len(tickets),
                    reason=resolved['reason'], issued_at=resolved['historical_dt'],
                    created_by_name=req.requested_by_name,
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
