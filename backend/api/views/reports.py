import csv
from datetime import datetime, timedelta

from django.http import HttpResponse
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ..models import TicketPrice, Ticket, RemittanceBatch
from .helpers import filter_collected, summarize, parse_date_start, parse_date_end


@api_view(['GET'])
def report_summary(request):
    start_date = request.query_params.get('start_date')
    end_date = request.query_params.get('end_date')

    tickets = list(filter_collected(start_date, end_date))

    now_ph = timezone.now() + timedelta(hours=8)
    today_utc_start = timezone.make_aware(
        datetime(now_ph.year, now_ph.month, now_ph.day, 0, 0, 0) - timedelta(hours=8)
    )
    today_utc_end = timezone.make_aware(
        datetime(now_ph.year, now_ph.month, now_ph.day, 23, 59, 59) - timedelta(hours=8)
    )

    latest_price = TicketPrice.objects.order_by('-effective_date').first()
    fallback_amount = float(latest_price.amount) if latest_price else 0.0

    today = [t for t in tickets if today_utc_start <= t.issued_at <= today_utc_end]

    return Response({
        'today': summarize(today, fallback_amount),
        'grand_total': round(sum(
            float(t.collection_amount) if (t.collection_amount and float(t.collection_amount) > 0) else fallback_amount
            for t in tickets
        ), 2),
        'total_tickets': len(tickets),
    })


@api_view(['GET'])
def report_collections(request):
    start_date = request.query_params.get('start_date')
    end_date = request.query_params.get('end_date')

    tickets = filter_collected(start_date, end_date).select_related('vehicle', 'driver', 'active_user').order_by('-issued_at')

    data = []
    for t in tickets:
        local_dt = t.issued_at + timedelta(hours=8)
        data.append({
            'id': t.id,
            'issued_at': local_dt.strftime('%Y-%m-%d %H:%M'),
            'issued_date': local_dt.strftime('%Y-%m-%d'),
            'driver': str(t.driver) if t.driver else '',
            'vehicle': t.vehicle.plate_number if t.vehicle else '',
            'route': t.route_name,
            'collection_amount': float(t.collection_amount or 0),
            'status': t.status,
        })

    return Response({'results': data, 'count': len(data)})


@api_view(['GET'])
def report_daily_chart(request):
    start_date = request.query_params.get('start_date')
    end_date = request.query_params.get('end_date')

    tickets = filter_collected(start_date, end_date)

    latest_price = TicketPrice.objects.order_by('-effective_date').first()
    fallback_amount = float(latest_price.amount) if latest_price else 0.0

    daily = {}
    for t in tickets:
        local_dt = t.issued_at + timedelta(hours=8)
        day_key = local_dt.strftime('%Y-%m-%d')

        amount = float(t.collection_amount) if (t.collection_amount and float(t.collection_amount) > 0) else fallback_amount

        if day_key not in daily:
            daily[day_key] = {'date': day_key, 'count': 0, 'total': 0.0}

        daily[day_key]['count'] += 1
        daily[day_key]['total'] = round(daily[day_key]['total'] + amount, 2)

    return Response({'chart_data': sorted(daily.values(), key=lambda x: x['date'])})


@api_view(['GET'])
def eod_reconciliation(request):
    date_str = request.query_params.get('date')
    if not date_str:
        now_ph = timezone.now() + timedelta(hours=8)
        date_str = now_ph.strftime('%Y-%m-%d')

    day_start = parse_date_start(date_str)
    day_end = parse_date_end(date_str)

    dispatched_today = list(Ticket.objects.filter(
        status__in=['DISPATCHED', 'COLLECTED'],
        dispatched_at__gte=day_start,
        dispatched_at__lte=day_end,
    ).select_related('series'))

    checkout_count = len(dispatched_today)
    expected_cash = round(sum(float(t.collection_amount or 0) for t in dispatched_today), 2)

    batches_today = RemittanceBatch.objects.filter(issued_at__gte=day_start, issued_at__lte=day_end)
    actual_cash = round(sum(float(b.total_amount or 0) for b in batches_today), 2)

    by_series = {}
    for t in dispatched_today:
        if t.series_id:
            by_series.setdefault(t.series_id, []).append(t)

    ticket_number_gaps = []
    for series_tickets in by_series.values():
        try:
            numbers = sorted(int(t.id) for t in series_tickets)
        except ValueError:
            continue
        missing = [n for n in range(numbers[0], numbers[-1] + 1) if n not in numbers]
        if missing:
            series_obj = series_tickets[0].series
            ticket_number_gaps.append({
                'series_no': series_obj.series_no if series_obj else '',
                'missing_numbers': missing,
            })

    open_sessions = Ticket.objects.filter(status='ISSUED').select_related('vehicle', 'driver').order_by('issued_at')
    open_sessions_data = [{
        'ticket_id': t.id,
        'plate_number': t.vehicle.plate_number if t.vehicle else None,
        'driver': str(t.driver) if t.driver else None,
        'issued_at': t.issued_at,
    } for t in open_sessions]

    return Response({
        'date': date_str,
        'checkout_count': checkout_count,
        'expected_cash': expected_cash,
        'actual_cash': actual_cash,
        'difference': round(expected_cash - actual_cash, 2),
        'ticket_number_gaps': ticket_number_gaps,
        'open_sessions': open_sessions_data,
    })


@api_view(['GET'])
def export_collections_csv(request):
    start_date = request.query_params.get('start_date')
    end_date = request.query_params.get('end_date')

    tickets = filter_collected(start_date, end_date).select_related(
        'vehicle', 'driver', 'active_user'
    ).order_by('-issued_at')

    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = 'attachment; filename="collections_report.csv"'

    writer = csv.writer(response)
    writer.writerow([
        "Ticket ID", "Issued Date", "Issued Time",
        "Driver", "Vehicle", "Route", "Collection Amount",
        "Status", "User"
    ])

    for t in tickets:
        local_dt = t.issued_at + timedelta(hours=8)
        writer.writerow([
            t.id,
            local_dt.strftime('%Y-%m-%d'),
            local_dt.strftime('%H:%M'),
            str(t.driver) if t.driver else "",
            t.vehicle.plate_number if t.vehicle else "",
            t.route_name,
            float(t.collection_amount or 0),
            t.status,
            t.active_user.username if t.active_user else "System",
        ])

    return response
