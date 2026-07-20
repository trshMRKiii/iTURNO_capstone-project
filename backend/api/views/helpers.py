from datetime import datetime, timedelta, timezone as dt_timezone

from django.db import transaction
from django.utils import timezone

from ..models import Ticket, TicketPrice, AuditLog, Vehicle


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
            .filter(status='ISSUED', issued_at__lt=today_start)
        )
        if not stale:
            return

        vehicle_ids = set()
        reason = 'Auto-cancelled: vehicle was not dispatched before end of day.'
        for ticket in stale:
            ticket.status = 'CANCELLED'
            ticket.reason = reason
            ticket.save(update_fields=['status', 'reason', 'updated_at'])
            vehicle_ids.add(ticket.vehicle_id)
            record_audit_log(
                user=actor,
                action='UPDATE',
                model_name='Ticket',
                object_id=ticket.id,
                object_repr=str(ticket),
                changes={'status': 'CANCELLED', 'reason': reason, 'auto_expired': True},
            )

        Vehicle.objects.filter(id__in=vehicle_ids, status='QUEUED').update(
            status='AVAILABLE', updated_at=timezone.now()
        )


def record_audit_log(user, action, model_name, object_id='', object_repr='', changes=None):
    AuditLog.objects.create(
        user=user if user and getattr(user, 'is_authenticated', False) else None,
        action=action,
        model_name=model_name,
        object_id=str(object_id),
        object_repr=str(object_repr)[:255],
        changes=changes or {},
    )


def summarize(ticket_list, fallback_amount=0.0):
    count = len(ticket_list)
    total = round(sum(
        float(t.collection_amount) if (t.collection_amount is not None and float(t.collection_amount) > 0) else fallback_amount
        for t in ticket_list
    ), 2)
    return {'count': count, 'total': total}
