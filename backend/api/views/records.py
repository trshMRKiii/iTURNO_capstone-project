from datetime import datetime, timedelta

from django.db import transaction
from django.db.models import Min, Q
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from ..models import User, Ticket, Vehicle, Route, RemittanceBatch, Collection, Deposit, AuditLog
from ..serializers import TicketSerializer, RemittanceBatchSerializer, AuditLogSerializer
from .helpers import parse_iso_datetime, record_audit_log, parse_date_start, parse_date_end, expire_stale_queue_tickets, paginate_request


@api_view(['GET'])
def audit_logs(request):
    show_all = request.query_params.get('all', 'false').lower() == 'true'

    logs = AuditLog.objects.select_related('user').order_by('-created_at')

    start_date = request.query_params.get('start_date')
    end_date = request.query_params.get('end_date')
    if start_date:
        try:
            logs = logs.filter(created_at__gte=parse_date_start(start_date))
        except ValueError:
            pass
    if end_date:
        try:
            logs = logs.filter(created_at__lte=parse_date_end(end_date))
        except ValueError:
            pass

    paged = paginate_request(request, logs)
    if paged is not None:
        page_num, page_size, total, sliced = paged
        data = AuditLogSerializer(sliced, many=True).data
        return Response({
            'logs': data,
            'total': total,
            'page': page_num,
            'page_size': page_size,
            'total_pages': max((total + page_size - 1) // page_size, 1),
        })

    total = logs.count()
    data = AuditLogSerializer(logs if show_all else logs[:10], many=True).data
    return Response({'logs': data, 'total': total})


# Used when a route has no manually configured estimated_loading_minutes.
DEFAULT_ESTIMATED_LOADING_MINUTES = 5


@api_view(['GET'])
@permission_classes([AllowAny])
def public_queue(request):
    expire_stale_queue_tickets()
    vehicles_with_queued_tickets = Vehicle.objects.filter(
        tickets__status='QUEUED',
        is_archived=False
    ).distinct().select_related('route', 'active_driver').annotate(
        _queue_time=Min('tickets__issued_at', filter=Q(tickets__status='QUEUED')),
        # Set only for whichever vehicle is currently first-in-line for its
        # route (see promote_queue_front in views/helpers.py) — that's the one
        # actually in the loading zone, so its estimate should count from here,
        # not from when it originally joined the queue. Falls back to
        # _queue_time below for legacy rows queued before this field existed.
        _loading_started=Min('tickets__loading_started_at', filter=Q(tickets__status='QUEUED')),
        # Manual drag-and-drop order from Dispatch (see reorder_queue in
        # views/viewsets.py) — must be honored here too, or the public board
        # keeps showing plain FIFO order after a dispatcher reorders the line.
        _queue_rank=Min('tickets__queue_rank', filter=Q(tickets__status='QUEUED')),
        # A dispatcher's "+5m" extension (see handleExtendLoading in
        # dispatch.jsx) must push this same departure estimate out too, or the
        # public board keeps counting down to a time the terminal already
        # knows it will miss.
        _extra_minutes=Min('tickets__extra_loading_minutes', filter=Q(tickets__status='QUEUED')),
    ).order_by('_queue_rank', '_queue_time')

    data = []
    for vehicle in vehicles_with_queued_tickets:
        route_name = vehicle.route.full_name if vehicle.route else 'No Route'
        departure_time = None
        loading_start = vehicle._loading_started or vehicle._queue_time
        if loading_start:
            est_minutes = (
                vehicle.route.estimated_loading_minutes
                if vehicle.route and vehicle.route.estimated_loading_minutes
                else DEFAULT_ESTIMATED_LOADING_MINUTES
            ) + (vehicle._extra_minutes or 0)
            local_dt = loading_start + timedelta(minutes=est_minutes) + timedelta(hours=8)
            departure_time = local_dt.strftime('%I:%M %p')

        data.append({
            'id': vehicle.id,
            'plate_number': vehicle.plate_number,
            'driver': f"{vehicle.active_driver.last_name}, {vehicle.active_driver.first_name}".strip() if vehicle.active_driver else '',
            'route': route_name,
            'departure_time': departure_time,
        })

    return Response(data)


@api_view(['GET'])
def server_time(request):
    now = timezone.now()
    return Response({'time': now.isoformat()})


@api_view(['GET'])
def supervisors(request):
    """Who a requisition or remittance can be requested/prepared by. Open to anyone who can
    record one, since the staff list itself is limited to admins."""
    users = User.objects.filter(role='SUPERVISOR', is_active=True).order_by('first_name', 'last_name')
    return Response([{'id': u.id, 'name': u.display_name} for u in users])


def _supervisor_from(data):
    prepared_by = str(data.get('prepared_by') or '')
    supervisor = User.objects.filter(pk=prepared_by, role='SUPERVISOR', is_active=True).first() if prepared_by.isdigit() else None
    if supervisor is None:
        raise ValidationError({'prepared_by': 'Choose the supervisor who prepared this remittance.'})
    return supervisor


def _write_batch_lines(batch, data):
    for c in data.get('collections', []):
        Collection.objects.create(
            batch=batch,
            ticket_form_no=c.get('ticketFormNo', ''),
            from_no=str(c.get('from', '')),
            to_no=str(c.get('to', '')),
            amount=c.get('amount', 0),
        )
    for d in data.get('deposits', []):
        Deposit.objects.create(
            batch=batch,
            type=d.get('type', 'bill'),
            denomination=d.get('denomination', 0),
            quantity=d.get('quantity', 0),
            deposit_amount=d.get('depositAmount', 0),
        )
    # Mark the tickets this batch covers as remitted so they aren't offered again.
    ticket_ids = data.get('ticket_ids') or []
    if ticket_ids:
        Ticket.objects.filter(pk__in=ticket_ids, remittance_batch__isnull=True).update(remittance_batch=batch)


def day_remittance(covers_date):
    """The day's one in-system remittance (outside/EXT batches are filed separately and don't count)."""
    start, end = parse_date_start(str(covers_date)), parse_date_end(str(covers_date))
    return RemittanceBatch.objects.exclude(batch_code__startswith='EXT-').filter(
        Q(covers_date=covers_date) |
        Q(covers_date__isnull=True, issued_at__gte=start, issued_at__lte=end)
    ).first()


@api_view(['GET', 'POST'])
def remittance_batches(request):
    if request.method == 'POST':
        data = request.data
        supervisor = _supervisor_from(data)
        covers_date = data.get('covers_date') or None
        existing = day_remittance(covers_date) if covers_date else None
        if existing:
            # One remittance per day: later tickets are added by amending it.
            raise ValidationError(f"{covers_date} was already remitted as {existing.batch_code}. Edit that remittance to include new tickets.")
        batch = RemittanceBatch.objects.create(
            batch_code=data.get('id'),
            issued_by=request.user if request.user.is_authenticated else None,
            prepared_by_name=supervisor.display_name,
            total_amount=data.get('total_amount', 0),
            covers_date=covers_date,
        )
        _write_batch_lines(batch, data)
        return Response({'id': batch.id, 'status': 'created'}, status=201)

    batches = RemittanceBatch.objects.select_related('issued_by').order_by('-issued_at')

    is_archived = request.query_params.get('is_archived')
    if is_archived is not None:
        batches = batches.filter(is_archived=is_archived.lower() in ('1', 'true', 'yes'))

    start_date = request.query_params.get('start_date')
    end_date = request.query_params.get('end_date')
    if start_date:
        try:
            batches = batches.filter(issued_at__gte=parse_date_start(start_date))
        except ValueError:
            pass
    if end_date:
        try:
            batches = batches.filter(issued_at__lte=parse_date_end(end_date))
        except ValueError:
            pass

    paged = paginate_request(request, batches)
    if paged is not None:
        page_num, page_size, total, sliced = paged
        serializer = RemittanceBatchSerializer(sliced, many=True)
        return Response({
            'results': serializer.data,
            'count': total,
            'page': page_num,
            'page_size': page_size,
            'total_pages': max((total + page_size - 1) // page_size, 1),
        })

    serializer = RemittanceBatchSerializer(batches, many=True)
    return Response({
        'results': serializer.data,
        'count': batches.count()
    })


@api_view(['POST'])
def amend_remittance_batch(request, batch_id):
    """Re-file a day's remittance with the tickets issued since it was made: the batch keeps
    its code and date, but its collections, deposits and total are replaced."""
    batch = RemittanceBatch.objects.filter(pk=batch_id).exclude(batch_code__startswith='EXT-').first()
    if batch is None:
        raise ValidationError('Remittance not found.')
    if batch.is_archived:
        raise ValidationError('This remittance is archived and can no longer be edited.')
    data = request.data
    supervisor = _supervisor_from(data)
    with transaction.atomic():
        before = float(batch.total_amount)
        batch.collections.all().delete()
        batch.deposits.all().delete()
        batch.prepared_by_name = supervisor.display_name
        batch.total_amount = data.get('total_amount', 0)
        batch.save(update_fields=['prepared_by_name', 'total_amount'])
        _write_batch_lines(batch, data)
        record_audit_log(request.user, 'UPDATE', 'RemittanceBatch', batch.pk, batch.batch_code,
                         {'total_amount': [before, float(batch.total_amount)], 'amended': True})
    return Response({'id': batch.id, 'status': 'amended'})
