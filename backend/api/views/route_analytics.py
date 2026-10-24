from collections import defaultdict

from django.db.models import Count, F, Q
from rest_framework.decorators import api_view
from rest_framework.response import Response

from ..models import Ticket
from .helpers import parse_date_start, parse_date_end, paginate_request

NO_ROUTE = 'No route'


def _tickets(params):
    """Cancelled tickets never carried a passenger load, so they're skipped. The date
    range filters created_at, same as TicketViewSet, so the numbers match the logs."""
    qs = Ticket.objects.exclude(status='CANCELLED')
    try:
        if params.get('start_date'):
            qs = qs.filter(created_at__gte=parse_date_start(params['start_date']))
        if params.get('end_date'):
            qs = qs.filter(created_at__lte=parse_date_end(params['end_date']))
    except ValueError:
        pass
    search = params.get('search', '').strip()
    if search:
        qs = qs.filter(
            Q(route__origin__icontains=search)
            | Q(driver__first_name__icontains=search)
            | Q(driver__last_name__icontains=search)
            | Q(vehicle__plate_number__icontains=search)
        )
    return qs


SORT_FIELDS = {
    'driver': ('driver__last_name', 'driver__first_name'),
    'queue': ('queue',),
    'roaming': ('roaming',),
    'total': ('total',),
}


def _order(params):
    """?sort=driver|queue|roaming|total with ?dir=asc|desc; busiest-first by default."""
    fields = SORT_FIELDS.get(params.get('sort'), SORT_FIELDS['total'])
    prefix = '' if params.get('dir') == 'asc' else '-'
    return [f'{prefix}{f}' for f in fields] + ['-total', 'driver__last_name', 'driver__first_name']


def _by_driver(qs, *group, order=('-total', 'driver__last_name', 'driver__first_name')):
    """Queue / roaming counts per driver (and per whatever else is in `group`), busiest first
    unless `order` says otherwise."""
    return (
        qs.values('driver_id', 'driver__last_name', 'driver__first_name', *group)
        .annotate(
            queue=Count('pk', filter=Q(mode='QUEUE')),
            roaming=Count('pk', filter=Q(mode='UNLOAD')),
            total=F('queue') + F('roaming'),
        )
        .order_by(*order)
    )


def _plates(qs):
    plates = defaultdict(list)
    pairs = qs.values_list('route__origin', 'driver_id', 'vehicle__plate_number').distinct().order_by('vehicle__plate_number')
    for route, driver_id, plate in pairs:
        plates[(route, driver_id)].append(plate)
    return plates


def _driver_row(r, plates):
    return {
        'route': r['route__origin'] or NO_ROUTE,
        'driver': f"{r['driver__last_name']}, {r['driver__first_name']}".strip(),
        'plates': plates[(r['route__origin'], r['driver_id'])],
        'queue': r['queue'],
        'roaming': r['roaming'],
        'total': r['total'],
    }


@api_view(['GET'])
def route_analytics(request):
    """Per-route tally of who took a queue slot vs. a roaming ticket, computed in the
    database so the report never ships every ticket to the browser.
      (default)    one row per route, busiest first
      ?route=NAME  that route's drivers, paginated (?page, ?page_size) and sortable (?sort, ?dir)
      ?export=1    every route's drivers, flat, for the PDF (narrowed to ?route=NAME if given)
    """
    params = request.query_params
    qs = _tickets(params)

    route = params.get('route')
    if route:
        qs = qs.filter(route__isnull=True) if route == NO_ROUTE else qs.filter(route__origin=route)

    if params.get('export'):
        plates = _plates(qs)
        return Response({'results': [_driver_row(r, plates) for r in _by_driver(qs, 'route__origin')]})

    if route:
        rows = _by_driver(qs, 'route__origin', order=_order(params))
        page_num, page_size, total, sliced = paginate_request(request, rows) or (1, 25, rows.count(), rows[:25])
        plates = _plates(qs)
        return Response({
            'results': [_driver_row(r, plates) for r in sliced],
            'count': total,
            'page': page_num,
            'page_size': page_size,
            'total_pages': max((total + page_size - 1) // page_size, 1),
        })

    routes = (
        qs.values('route__origin')
        .annotate(
            queue=Count('pk', filter=Q(mode='QUEUE')),
            roaming=Count('pk', filter=Q(mode='UNLOAD')),
            drivers=Count('driver', distinct=True),
            total=F('queue') + F('roaming'),
        )
        .order_by('-total', 'route__origin')
    )
    return Response({'routes': [
        {'route': r['route__origin'] or NO_ROUTE, 'queue': r['queue'], 'roaming': r['roaming'],
         'total': r['total'], 'drivers': r['drivers']}
        for r in routes
    ]})
