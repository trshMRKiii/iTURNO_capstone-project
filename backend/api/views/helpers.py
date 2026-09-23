from datetime import datetime, timedelta, timezone as dt_timezone

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from ..models import Ticket, TicketPrice, AuditLog, Vehicle, Route, User


def parse_date_start(date_str):
    d = datetime.strptime(date_str, '%Y-%m-%d')
    ph_start = datetime(d.year, d.month, d.day, 0, 0, 0)
    return timezone.make_aware(ph_start - timedelta(hours=8))


def parse_date_end(date_str):
    d = datetime.strptime(date_str, '%Y-%m-%d')
    ph_end = datetime(d.year, d.month, d.day, 23, 59, 59)
    return timezone.make_aware(ph_end - timedelta(hours=8))


def parse_iso_datetime(value):
    if not value:
        return timezone.now()
    try:
        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        dt = datetime.strptime(value, '%Y-%m-%dT%H:%M:%S.%fZ')
    if timezone.is_naive(dt):
        return timezone.make_aware(dt, dt_timezone.utc)
    return dt.astimezone(dt_timezone.utc)


def expire_stale_unverified_accounts():
    """Drops admin-added staff accounts that never verified their email within
    30 days — the point of verification is to keep a bad/fake email from
    sitting around as a permanent unusable account, so it's dropped instead
    of nagging forever. Called lazily from UserViewSet.get_queryset (same
    no-scheduler-needed convention as expire_stale_queue_tickets above).
    Targets 'supabase' directly — User is Supabase-authoritative (see
    api/sync/registry.py), so that's the copy that actually needs cleaning."""
    cutoff = timezone.now() - timedelta(days=30)
    User.objects.using('supabase').filter(email_verified=False, created_at__lt=cutoff).delete()


def filter_collected(start_date=None, end_date=None):
    qs = Ticket.objects.filter(status='COLLECTED')
    if start_date:
        try:
            qs = qs.filter(issued_at__gte=parse_date_start(start_date))
        except ValueError:
            pass
    if end_date:
        try:
            qs = qs.filter(issued_at__lte=parse_date_end(end_date))
        except ValueError:
            pass
    return qs


def expire_stale_queue_tickets(actor=None):
    """Auto-cancel ISSUED tickets left over from a previous day and free their vehicle.

    A vehicle checked into the queue but never dispatched before the terminal closes
    otherwise stays stuck as QUEUED forever, blocking its route's queue position. This
    is called lazily from the queue-facing list endpoints so the first request after
    PH midnight self-heals it — no scheduler needed.
    """
    now_ph = timezone.now() + timedelta(hours=8)
    today_start = parse_date_start(now_ph.strftime('%Y-%m-%d'))

    with transaction.atomic():
        stale = list(
            Ticket.objects.select_for_update()
            .filter(status='QUEUED', issued_at__lt=today_start)
        )
        if not stale:
            return

        vehicle_ids = set()
        routes = set()
        reason = 'Auto-cancelled: vehicle was not dispatched before end of day.'
        now = timezone.now()
        logs = []
        for ticket in stale:
            ticket.status = 'CANCELLED'
            ticket.reason = reason
            ticket.updated_at = now  # bulk_update bypasses auto_now, so set it explicitly
            vehicle_ids.add(ticket.vehicle_id)
            if ticket.route_id:
                routes.add(ticket.route_id)
            logs.append(AuditLog(
                user=actor if actor and getattr(actor, 'is_authenticated', False) else None,
                action='UPDATE',
                model_name='Ticket',
                object_id=str(ticket.id),
                object_repr=str(ticket)[:255],
                changes={'status': 'CANCELLED', 'reason': reason, 'auto_expired': True},
            ))

        Ticket.objects.bulk_update(stale, ['status', 'reason', 'updated_at'])
        AuditLog.objects.bulk_create(logs)

        # The driver checked in for that stale shift never got dispatched, so
        # the vehicle reverts to its registered owner rather than staying
        # pinned to whoever was checked in when the day ended.
        Vehicle.objects.filter(id__in=vehicle_ids, status='QUEUED').update(
            status='AVAILABLE', active_driver=F('owner_driver'), updated_at=timezone.now()
        )

        # Whoever was behind an auto-cancelled front ticket just became first
        # in line for their route.
        for route in Route.objects.filter(id__in=routes):
            promote_queue_front(route)


def promote_queue_front(route):
    """Mark whichever QUEUED ticket is now earliest-in-line for `route` as having
    reached the loading zone, if it isn't marked already.

    Call this right after a ticket is queued (it may already be the front) and
    right after the previous front ticket leaves the queue (dispatch/cancel/
    expiry), so the next vehicle's estimated-departure clock starts when it
    actually reaches the front of the line — not back when it originally
    joined the queue.
    """
    if not route:
        return
    front = Ticket.objects.filter(
        route=route, mode='QUEUE', status='QUEUED',
    ).order_by('issued_at').first()
    if front and front.loading_started_at is None:
        front.loading_started_at = timezone.now()
        front.save(update_fields=['loading_started_at'])


def record_audit_log(user, action, model_name, object_id='', object_repr='', changes=None):
    AuditLog.objects.create(
        user=user if user and getattr(user, 'is_authenticated', False) else None,
        action=action,
        model_name=model_name,
        object_id=str(object_id),
        object_repr=str(object_repr)[:255],
        changes=changes or {},
    )


def paginate_request(request, queryset, default_page_size=25, max_page_size=200):
    """Opt-in pagination: returns None when the caller didn't ask for a page (so
    existing callers that expect the full queryset are unaffected), otherwise
    returns (page_num, page_size, total, sliced_queryset) for the requested page.
    """
    page_param = request.query_params.get('page')
    if page_param is None:
        return None
    try:
        page_num = max(int(page_param), 1)
    except ValueError:
        page_num = 1
    try:
        page_size = min(max(int(request.query_params.get('page_size', default_page_size)), 1), max_page_size)
    except ValueError:
        page_size = default_page_size
    total = queryset.count()
    start = (page_num - 1) * page_size
    return page_num, page_size, total, queryset[start:start + page_size]


def summarize(ticket_list, fallback_amount=0.0):
    count = len(ticket_list)
    total = round(sum(
        float(t.collection_amount) if (t.collection_amount is not None and float(t.collection_amount) > 0) else fallback_amount
        for t in ticket_list
    ), 2)
    return {'count': count, 'total': total}
