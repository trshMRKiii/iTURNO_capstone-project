from datetime import datetime, timedelta

from django.db.models import Sum
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ..models import Ticket, TicketPrice, Vehicle, Driver, Route, RemittanceBatch, Collection, Deposit, AuditLog, TerminalPrice
from ..serializers import TicketSerializer, RemittanceBatchSerializer, AuditLogSerializer, TerminalPriceSerializer
from .helpers import summarize, parse_iso_datetime, record_audit_log, parse_date_start, parse_date_end, expire_stale_queue_tickets


@api_view(['GET'])
def transaction_logs(request):
    show_all = request.query_params.get('all', 'false').lower() == 'true'

    tickets = Ticket.objects.select_related('vehicle', 'driver', 'active_user').order_by('-created_at')

    data = []
    for t in tickets:
        local_dt = t.created_at + timedelta(hours=8)
        data.append({
            'id': t.id,
            'action': t.status,
            'ticket_id': t.id,
            'driver': str(t.driver) if t.driver else '',
            'vehicle': t.vehicle.plate_number if t.vehicle else '',
            'route': t.route_name,
            'amount': float(t.collection_amount or 0),
            'timestamp': local_dt.strftime('%Y-%m-%d %H:%M:%S'),
            'user': t.active_user.get_full_name() or t.active_user.username if t.active_user else 'System',
        })

    total = len(data)
    if not show_all:
        data = data[:10]

    return Response({'logs': data, 'total': total})


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

    data = AuditLogSerializer(logs, many=True).data
    total = len(data)
    if not show_all:
        data = data[:10]

    return Response({'logs': data, 'total': total})


@api_view(['GET'])
def dashboard_stats(request):
    now_ph = timezone.now() + timedelta(hours=8)
    today_str = now_ph.strftime('%Y-%m-%d')

    start_date = request.query_params.get('start_date') or today_str
    end_date = request.query_params.get('end_date') or today_str
    # A future "to" date can't tell us anything — clamp it to today.
    if end_date > today_str:
        end_date = today_str
    if start_date > end_date:
        start_date = end_date

    range_start = parse_date_start(start_date)
    range_end = parse_date_end(end_date)

    range_dispatched = Ticket.objects.filter(
        dispatched_at__isnull=False,
        dispatched_at__gte=range_start,
        dispatched_at__lte=range_end,
    )
    range_issued = Ticket.objects.filter(issued_at__gte=range_start, issued_at__lte=range_end)

    latest_price = TicketPrice.objects.order_by('-effective_date').first()
    fallback_amount = float(latest_price.amount) if latest_price else 0.0

    return Response({
        'today_total': summarize(range_dispatched, fallback_amount),
        'total_tickets': Ticket.objects.count(),
        'total_dispatched': Ticket.objects.filter(dispatched_at__isnull=False).count(),
        'total_revenue': round(float(range_dispatched.aggregate(s=Sum('collection_amount'))['s'] or 0), 2),
        'active_vehicles': range_issued.values('vehicle_id').distinct().count(),
        'active_drivers': range_issued.values('driver_id').distinct().count(),
        'start_date': start_date,
        'end_date': end_date,
    })


@api_view(['GET'])
def vehicle_records(request):
    try:
        vehicles = Vehicle.objects.select_related('route', 'active_driver').order_by('plate_number')

        data = []
        for v in vehicles:
            try:
                record = {
                    'id': v.id,
                    'plate_number': v.plate_number,
                    'route': v.route.full_name if v.route else '—',
                    'driver': v.active_driver.name if v.active_driver else '—',
                    'status': v.get_status_display() if hasattr(v, 'get_status_display') else v.status,
                }
                data.append(record)
            except Exception:
                continue

        return Response({'vehicles': data, 'total': len(data)})
    except Exception as e:
        return Response({'error': str(e), 'vehicles': [], 'total': 0}, status=500)


@api_view(['GET'])
def driver_records(request):
    try:
        drivers = Driver.objects.order_by('code')

        data = []
        for d in drivers:
            try:
                record = {
                    'id': d.id,
                    'code': d.code,
                    'name': d.name,
                    'contact_number': d.contact_number if d.contact_number else '—',
                }
                data.append(record)
            except Exception:
                continue

        return Response({'drivers': data, 'total': len(data)})
    except Exception as e:
        return Response({'error': str(e), 'drivers': [], 'total': 0}, status=500)


@api_view(['GET'])
def public_queue(request):
    expire_stale_queue_tickets()
    vehicles_with_issued_tickets = Vehicle.objects.filter(
        tickets__status='ISSUED',
        is_archived=False
    ).distinct().select_related('route', 'active_driver')

    data = []
    for vehicle in vehicles_with_issued_tickets:
        latest_ticket = vehicle.tickets.filter(status='ISSUED').order_by('-issued_at').first()
        departure_time = None
        if latest_ticket:
            local_dt = latest_ticket.issued_at + timedelta(hours=8)
            departure_time = local_dt.strftime('%I:%M %p')

        data.append({
            'id': vehicle.id,
            'plate_number': vehicle.plate_number,
            'driver': vehicle.active_driver.name if vehicle.active_driver else '',
            'route': vehicle.route.full_name if vehicle.route else '',
            'status': vehicle.get_status_display(),
            'departure_time': departure_time,
        })

    return Response(data)


@api_view(['GET'])
def server_time(request):
    now = timezone.now()
    return Response({'time': now.isoformat()})


@api_view(['GET', 'PUT'])
def terminal_price_config(request):
    config = TerminalPrice.get_solo()
    if request.method == 'GET':
        return Response(TerminalPriceSerializer(config).data)

    serializer = TerminalPriceSerializer(config, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    record_audit_log(
        user=request.user,
        action='UPDATE',
        model_name='TerminalPrice',
        object_id=config.pk,
        object_repr='Terminal price configuration',
        changes=request.data,
    )
    return Response(serializer.data)


@api_view(['GET', 'POST'])
def remittance_batches(request):
    if request.method == 'POST':
        data = request.data
        batch = RemittanceBatch.objects.create(
            batch_code=data.get('id'),
            issued_by=request.user if request.user.is_authenticated else None,
            total_amount=data.get('total_amount', 0),
            status=data.get('status', 'OPEN'),
        )
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
        return Response({'id': batch.id, 'status': 'created'}, status=201)

    batches = RemittanceBatch.objects.select_related('issued_by').order_by('-issued_at')
    serializer = RemittanceBatchSerializer(batches, many=True)
    return Response({
        'results': serializer.data,
        'count': batches.count()
    })
