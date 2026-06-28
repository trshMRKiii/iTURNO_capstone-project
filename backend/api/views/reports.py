import csv
from datetime import datetime, timedelta

from django.http import HttpResponse
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ..models import TicketPrice
from .helpers import filter_collected, get_batch, load_schedule, summarize


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

    schedule = load_schedule()
    batch_stats = {}
    for key in schedule.keys():
        normalized = key.lower().replace("_", "")
        batch_tickets = [t for t in tickets if get_batch(t) == key]
        batch_stats[normalized] = summarize(batch_tickets, fallback_amount)

    today = [t for t in tickets if today_utc_start <= t.issued_at <= today_utc_end]

    return Response({
        **batch_stats,
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
            'batch': get_batch(t).replace("_", " ").title() if get_batch(t) else '',
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
    schedule = load_schedule()

    latest_price = TicketPrice.objects.order_by('-effective_date').first()
    fallback_amount = float(latest_price.amount) if latest_price else 0.0

    daily = {}
    for t in tickets:
        local_dt = t.issued_at + timedelta(hours=8)
        day_key = local_dt.strftime('%Y-%m-%d')
        batch = get_batch(t)

        amount = float(t.collection_amount) if (t.collection_amount and float(t.collection_amount) > 0) else fallback_amount

        if day_key not in daily:
            daily[day_key] = {'date': day_key}
            for key in schedule.keys():
                normalized = key.lower().replace("_", "")
                daily[day_key][f"{normalized}_count"] = 0
                daily[day_key][f"{normalized}_total"] = 0.0

        if batch:
            normalized = batch.lower().replace("_", "")
            daily[day_key][f"{normalized}_count"] += 1
            daily[day_key][f"{normalized}_total"] = round(daily[day_key][f"{normalized}_total"] + amount, 2)

    return Response({'chart_data': sorted(daily.values(), key=lambda x: x['date'])})


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
        "Ticket ID", "Batch", "Issued Date", "Issued Time",
        "Driver", "Vehicle", "Route", "Collection Amount",
        "Status", "User"
    ])

    for t in tickets:
        local_dt = t.issued_at + timedelta(hours=8)
        writer.writerow([
            t.id,
            get_batch(t).replace("_", " ").title() if get_batch(t) else "",
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
