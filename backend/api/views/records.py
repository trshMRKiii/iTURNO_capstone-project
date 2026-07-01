import json
import os
from datetime import datetime, timedelta

from django.db.models import Sum
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ..models import Ticket, TicketPrice, Vehicle, Driver, Route, RemittanceBatch, Collection, Deposit
from ..serializers import TicketSerializer, RemittanceBatchSerializer
from .helpers import get_batch, load_schedule, summarize, parse_iso_datetime, generate_ticket_id


@api_view(['POST'])
def issue_late_ticket(request):
    try:
        data = request.data

        required_fields = ['vehicle', 'driver', 'route', 'intended_batch']
        for field in required_fields:
            if not data.get(field):
                return Response(
                    {"error": f"Missing required field: {field}"},
                    status=400
                )

        if not data.get('route') or data.get('route') == 'N/A':
            return Response(
                {"error": "Route cannot be empty or 'N/A'. Please select a valid vehicle with a route."},
                status=400
            )

        issued_at = parse_iso_datetime(data.get('issued_at'))
        ticket_id = generate_ticket_id(issued_at, data['intended_batch'])

        route_value = data.get('route')
        route_obj = None
        if route_value:
            if isinstance(route_value, int) or (isinstance(route_value, str) and route_value.isdigit()):
                route_obj = Route.objects.filter(id=int(route_value)).first()
            elif hasattr(route_value, 'pk'):
                route_obj = route_value
            else:
                route_obj = Route.objects.filter(origin=route_value).first()

        if not route_obj:
            return Response(
                {"error": "Route cannot be found. Please select a valid route."},
                status=400
            )

        ticket = Ticket.objects.create(
            id=ticket_id,
            vehicle_id=data['vehicle'],
            driver_id=data['driver'],
            route=route_obj,
            status='ISSUED',
            is_late=True,
            intended_batch=data['intended_batch'],
            issued_at=issued_at,
            active_user=request.user if request.user.is_authenticated else None,
        )

        from ..rewards import award_queue_point
        try:
            award_queue_point(ticket.driver, queue_date=issued_at.date())
        except Exception:
            import logging
            logging.getLogger(__name__).exception("award_queue_point failed for ticket %s", ticket.id)

        serializer = TicketSerializer(ticket)
        return Response({
            "message": "Late ticket issued successfully",
            "ticket": serializer.data
        }, status=201)

    except Exception as e:
        return Response(
            {"error": str(e)},
            status=400
        )


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
            'batch': get_batch(t),
        })

    total = len(data)
    if not show_all:
        data = data[:10]

    return Response({'logs': data, 'total': total})


@api_view(['GET'])
def dashboard_stats(request):
    now_ph = timezone.now() + timedelta(hours=8)
    today_start = timezone.make_aware(
        datetime(now_ph.year, now_ph.month, now_ph.day, 0, 0, 0) - timedelta(hours=8)
    )

    today_dispatched = Ticket.objects.filter(
        dispatched_at__isnull=False,
        dispatched_at__gte=today_start
    )

    latest_price = TicketPrice.objects.order_by('-effective_date').first()
    fallback_amount = float(latest_price.amount) if latest_price else 0.0

    schedule = load_schedule()
    batch_stats = {}
    for key in schedule.keys():
        batch_tickets = [t for t in today_dispatched if get_batch(t) == key]
        normalized = key.lower().replace("_", "")
        batch_stats[f"{normalized}_today"] = summarize(batch_tickets, fallback_amount)

    return Response({
        **batch_stats,
        'today_total': summarize(today_dispatched, fallback_amount),
        'total_tickets': Ticket.objects.count(),
        'total_dispatched': Ticket.objects.filter(dispatched_at__isnull=False).count(),
        'total_revenue': round(float(today_dispatched.aggregate(s=Sum('collection_amount'))['s'] or 0), 2),
        'active_vehicles': Vehicle.objects.filter(is_archived=False).count(),
        'active_drivers': Driver.objects.filter(is_archived=False).count(),
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
def schedules_view(request):
    from django.conf import settings as django_settings
    file_path = os.path.join(django_settings.BASE_DIR, 'schedules.json')
    if request.method == 'GET':
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
            return Response(data)
        except FileNotFoundError:
            return Response({'error': 'Schedules file not found'}, status=404)
        except json.JSONDecodeError:
            return Response({'error': 'Invalid JSON'}, status=500)
    elif request.method == 'PUT':
        try:
            data = request.data
            with open(file_path, 'w') as f:
                json.dump(data, f, indent=2)
            return Response({'status': 'updated'})
        except Exception as e:
            return Response({'error': str(e)}, status=500)


@api_view(['GET', 'POST'])
def remittance_batches(request):
    if request.method == 'POST':
        data = request.data
        batch = RemittanceBatch.objects.create(
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
