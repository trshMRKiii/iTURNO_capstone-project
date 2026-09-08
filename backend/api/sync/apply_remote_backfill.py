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
        else:
            req.status = 'FAILED'
            req.result_reason = reason or outcome
            failed += 1
        req.applied_at = timezone.now()
        req.save(using='supabase')

    if pending:
        logger.info('remote backfill: %s applied, %s failed', applied, failed)
    return applied, failed
