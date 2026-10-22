from datetime import datetime, timedelta

from django.db.models import Count
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ..models import Route, Ticket, TicketPrice, TicketSeries
from .helpers import parse_date_start, parse_date_end, paper_numbers_by_series

# Ticket.mode -> the dashboard's Queued / Roamed split.
MODE_KEY = {'QUEUE': 'queued', 'UNLOAD': 'roamed'}
HEATMAP_WEEKS = 4

TICKET_FIELDS = ('dispatched_at', 'mode', 'collection_amount', 'route__origin', 'series__ticket_form__name')


def _dispatched(start, end):
    return Ticket.objects.filter(dispatched_at__gte=start, dispatched_at__lte=end).values_list(*TICKET_FIELDS)


def _blank_hour(hour):
    return {'hour': hour, 'queued': 0, 'roamed': 0, 'queued_total': 0.0, 'roamed_total': 0.0}


def _tally(rows, fallback):
    """One pass over dispatched tickets: the queued/roamed split, the per-hour-of-day
    breakdown, and the per-route (with its own hourly breakdown) and per-denomination
    totals. Everything counts a ticket on the same dispatched_at basis, so the cards on
    the page always agree."""
    split = {key: {'count': 0, 'total': 0.0} for key in MODE_KEY.values()}
    hourly = [_blank_hour(h) for h in range(24)]
    routes, forms = {}, {}
    for dispatched_at, mode, amount, route, form in rows:
        key = MODE_KEY.get(mode, 'queued')
        amount = float(amount) if amount and float(amount) > 0 else fallback
        split[key]['count'] += 1
        split[key]['total'] += amount
        # Hours and routes keep the queued/roamed split so the page can filter by it.
        hour = (dispatched_at + timedelta(hours=8)).hour
        route_name = route or 'No Route'
        route_row = routes.setdefault(route_name, {
            'name': route_name, 'queued': 0, 'roamed': 0, 'queued_total': 0.0, 'roamed_total': 0.0,
            'hourly': [_blank_hour(h) for h in range(24)],
        })
        for row in (hourly[hour], route_row['hourly'][hour], route_row):
            row[key] += 1
            row[f'{key}_total'] += amount
        form_name = form or 'Unspecified'
        row = forms.setdefault(form_name, {'name': form_name, 'count': 0, 'total': 0.0})
        row['count'] += 1
        row['total'] += amount
    for route_row in routes.values():
        route_row['hourly'] = [h for h in route_row['hourly'] if h['queued'] or h['roamed']]  # only the hours that had tickets
    route_hours = (h for route_row in routes.values() for h in route_row['hourly'])
    for row in (*split.values(), *hourly, *routes.values(), *route_hours, *forms.values()):
        for field, value in row.items():
            if isinstance(value, float):
                row[field] = round(value, 2)
    return split, hourly, routes, forms


def _queue_routes(now):
    """Every active route with how many vehicles wait on it, who is first in line and how
    long they have waited — the order is the dispatcher's (manual rank, then check-in)."""
    queued = (
        Ticket.objects.filter(status='QUEUED', vehicle__is_archived=False)
        .order_by('queue_rank', 'issued_at')
        .values_list('route__origin', 'vehicle_id', 'vehicle__plate_number', 'checked_in_at', 'issued_at')
    )
    lines = {}
    for origin, vehicle_id, plate, checked_in_at, issued_at in queued:
        name = origin or 'No Route'
        line = lines.setdefault(name, {
            'name': name,
            'vehicles': set(),
            'next_plate': plate,
            'waiting_minutes': int((now - (checked_in_at or issued_at)).total_seconds() // 60),
        })
        line['vehicles'].add(vehicle_id)
    idle = Route.objects.filter(is_archived=False, is_active=True).exclude(origin__in=lines).values_list('origin', flat=True)
    return [
        *({'name': l['name'], 'count': len(l['vehicles']), 'next_plate': l['next_plate'], 'waiting_minutes': l['waiting_minutes']} for l in lines.values()),
        *({'name': origin, 'count': 0, 'next_plate': None, 'waiting_minutes': 0} for origin in idle),
    ]


def _stock_by_form():
    """Physical ticket stock left across active requisitions, per denomination: pcs and cash
    left, plus the original size of the series still in stock (the Requisition page's
    "x of y" bar, summed). Same "remaining" math as TicketSeriesSerializer.get_remaining."""
    stock = {}
    paper = paper_numbers_by_series()
    series_list = TicketSeries.objects.filter(requisition__is_archived=False).select_related('ticket_form').annotate(issued_count=Count('tickets'))
    for series in series_list:
        original = max(int(series.end_no or 0) - int(series.start_no or 0) + 1, 0)
        remaining = max(original - series.issued_count - len(paper.get(series.id, ())), 0)
        name = series.ticket_form.name if series.ticket_form else 'Unspecified'
        price = float(series.ticket_form.price or 0) if series.ticket_form else 0
        row = stock.setdefault(name, {'name': name, 'remaining': 0, 'original': 0, 'amount': 0.0})
        row['remaining'] += remaining
        row['amount'] = round(row['amount'] + remaining * price, 2)
        if remaining > 0:
            row['original'] += original
    return list(stock.values())


def _flat_routes(routes):
    """Per-route counts without the hourly detail — what comparing one route needs."""
    return {name: {k: row[k] for k in ('queued', 'roamed', 'queued_total', 'roamed_total')} for name, row in routes.items()}


@api_view(['GET'])
def dashboard_stats(request):
    now = timezone.now()
    now_ph = now + timedelta(hours=8)
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
    latest_price = TicketPrice.objects.order_by('-effective_date').first()
    fallback = float(latest_price.amount) if latest_price else 0.0

    # What the page's "up/down vs ..." compares. Today is set against yesterday up to the same
    # time of day. A longer range that includes today leaves today out of the comparison — it
    # isn't finished, so it can't be set fairly against whole days — and compares whole days with
    # the same number of whole days before them. Any other range is compared whole against the
    # range of the same length just before it.
    days = (datetime.strptime(end_date, '%Y-%m-%d') - datetime.strptime(start_date, '%Y-%m-%d')).days + 1
    trimmed = days > 1 and end_date == today_str
    span = days - 1 if trimmed else days
    compare_end = range_end - timedelta(days=1) if trimmed else range_end
    shift = timedelta(days=span)
    previous, _, previous_routes, _ = _tally(_dispatched(range_start - shift, min(compare_end, now) - shift), fallback)

    summary, hourly, routes, forms = _tally(_dispatched(range_start, range_end), fallback)
    if trimmed:
        current, _, current_routes, _ = _tally(_dispatched(range_start, compare_end), fallback)
    else:
        current, current_routes = summary, routes

    return Response({
        'start_date': start_date,
        'end_date': end_date,
        'as_of': {'hour': now_ph.hour, 'label': now_ph.strftime('%I:%M %p').lstrip('0')} if end_date == today_str else None,
        'summary': summary,
        'compared': {
            'days': span,
            'trimmed': trimmed,
            'current': current,
            'previous': previous,
            # The same two periods per route, to compare a single route against.
            'current_routes': _flat_routes(current_routes),
            'previous_routes': _flat_routes(previous_routes),
        },
        'hourly': hourly,
        'collections_by_form': sorted(forms.values(), key=lambda f: -f['total']),
        'route_performance': list(routes.values()),
        'queue_routes': _queue_routes(now),
        'stock_by_form': _stock_by_form(),
    })


@api_view(['GET'])
def dashboard_busiest(request):
    """Average vehicle check-ins per weekday x hour over the last four full weeks (today
    excluded, so every weekday appears exactly four times). Not tied to the dashboard's period
    filter. Every ticket is one check-in, at checked_in_at (issued_at on older rows)."""
    today = (timezone.now() + timedelta(hours=8)).date()
    start = parse_date_start((today - timedelta(weeks=HEATMAP_WEEKS)).isoformat())
    end = parse_date_end((today - timedelta(days=1)).isoformat())
    arrivals = (
        Ticket.objects.annotate(arrived_at=Coalesce('checked_in_at', 'issued_at'))
        .filter(arrived_at__gte=start, arrived_at__lte=end)
        .values_list('arrived_at', flat=True)
    )
    counts = [[0] * 24 for _ in range(7)]
    for arrived_at in arrivals:
        local = arrived_at + timedelta(hours=8)
        counts[local.weekday()][local.hour] += 1
    # The dates each weekday row averages over, oldest first, so a cell can say which days it covers.
    dates = [[] for _ in range(7)]
    for back in range(HEATMAP_WEEKS * 7, 0, -1):
        day = today - timedelta(days=back)
        dates[day.weekday()].append(day.isoformat())
    return Response({
        'weeks': HEATMAP_WEEKS,
        'grid': [[round(n / HEATMAP_WEEKS, 2) for n in row] for row in counts],
        'dates': dates,
    })
