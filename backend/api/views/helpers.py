import time
from datetime import datetime, timedelta, timezone as dt_timezone

from django.conf import settings
from django.db import connections, transaction
from django.db.models import F
from django.utils import timezone

from ..models import Ticket, TicketPrice, AuditLog, Vehicle, Route, User, KioskSession
from ..sync.pause import sync_enabled

_SUPABASE_PROBE_TTL = 10
_supabase_probe = (0.0, False)


def supabase_reachable():
    """True if the Supabase mirror can be reached right now (always False while
    SYNC_ENABLED is off). Result is cached briefly so an offline LAN doesn't pay
    a connect attempt on every request."""
    global _supabase_probe
    if not sync_enabled():
        return False
    checked_at, ok = _supabase_probe
    if time.monotonic() - checked_at < _SUPABASE_PROBE_TTL:
        return ok
    try:
        connections['supabase'].ensure_connection()
        ok = True
    except Exception:
        connections['supabase'].close()
        ok = False
    _supabase_probe = (time.monotonic(), ok)
    return ok


def can_write_remote():
    """Gate for actions that normally need Supabase. DEBUG=True runs against the local
    throwaway db with pushing disabled, so those actions are allowed offline."""
    return settings.DEBUG or supabase_reachable()


def remote_db():
    """Alias to use for Supabase-authoritative rows: local under DEBUG, else 'supabase'."""
    return 'default' if settings.DEBUG else 'supabase'


def mirror_user(user):
    """Copy a User just written to Supabase into the local db right away: login reads the
    local copy, so it must not wait for the next pull."""
    if remote_db() != 'default':
        user.save(using='default')


def save_user(user):
    user.save(using=remote_db())
    mirror_user(user)


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


def expire_stale_queue_tickets():
    """Auto-cancel ISSUED tickets left over from a previous day and free their vehicle.

    A vehicle checked into the queue but never dispatched before the terminal closes
    otherwise stays stuck as QUEUED forever, blocking its route's queue position. This
    is called lazily from the queue-facing list endpoints so the first request after
    PH midnight self-heals it — no scheduler needed.
    """
    now_ph = timezone.now() + timedelta(hours=8)
    today_start = parse_date_start(now_ph.strftime('%Y-%m-%d'))

    # A kiosk visit left unfinished overnight (e.g. a roam never paid for) dies with the day.
    KioskSession.objects.filter(
        status__in=KioskSession.OPEN_STATUSES, created_at__lt=today_start,
    ).update(status='CANCELLED')

    with transaction.atomic():
        stale = list(
            Ticket.objects.select_for_update()
            .filter(status='QUEUED', issued_at__lt=today_start)
        )
        if not stale:
            return

        vehicle_ids = set()
        routes = set()
        now = timezone.now()
        for ticket in stale:
            ticket.status = 'CANCELLED'
            ticket.updated_at = now  # bulk_update bypasses auto_now, so set it explicitly
            vehicle_ids.add(ticket.vehicle_id)
            if ticket.route_id:
                routes.add(ticket.route_id)

        Ticket.objects.bulk_update(stale, ['status', 'updated_at'])

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

    Call this right after a ticket is queued (it may already be the front),
    right after the previous front ticket leaves the queue (dispatch/cancel/
    expiry), and after a manual drag-and-drop reorder, so the next vehicle's
    estimated-departure clock starts when it actually reaches the front of
    the line — not back when it originally joined the queue.
    """
    if not route:
        return
    queued = list(
        Ticket.objects.filter(route=route, mode='QUEUE', status='QUEUED')
        .order_by('queue_rank', 'issued_at')
    )
    if not queued:
        return

    front, rest = queued[0], queued[1:]
    if front.loading_started_at is None:
        front.loading_started_at = timezone.now()
        front.save(update_fields=['loading_started_at'])

    # A manual reorder can bump a vehicle that already started loading back
    # off the front (e.g. swapping it out for repair) without it ever
    # leaving the queue. Clear its clock so that if it's later promoted back
    # to front, it gets a fresh estimate instead of resuming the old one.
    stale = [t for t in rest if t.loading_started_at is not None or t.extra_loading_minutes]
    for t in stale:
        t.loading_started_at = None
        t.extra_loading_minutes = 0
    if stale:
        Ticket.objects.bulk_update(stale, ['loading_started_at', 'extra_loading_minutes'])


def record_audit_log(user, action, model_name, object_id='', object_repr='', changes=None):
    # A restore can remove the acting user's row; don't let that fail the log write.
    known = user and getattr(user, 'is_authenticated', False) and User.objects.filter(pk=user.pk).exists()
    AuditLog.objects.create(
        user=user if known else None,
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


def paper_numbers_by_series(series_ids=None):
    """{series_id: set of ticket numbers (as int)} reserved by paper issuances."""
    from ..models import PaperIssuance
    qs = PaperIssuance.objects.all()
    if series_ids is not None:
        qs = qs.filter(series_id__in=series_ids)
    out = {}
    for sid, a, b in qs.values_list('series_id', 'from_no', 'to_no'):
        out.setdefault(sid, set()).update(range(a, b + 1))
    return out
