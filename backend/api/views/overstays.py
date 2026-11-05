from datetime import timedelta

from rest_framework.decorators import api_view
from rest_framework.response import Response

from ..models import Ticket
from .helpers import parse_date_start, parse_date_end
from .records import DEFAULT_ESTIMATED_LOADING_MINUTES

ROAM_LIMIT_MINUTES = 5  # a roaming vehicle may stay this long inside the terminal (same limit the Dispatch board times)


def overstay_minutes(stay, allowed_minutes):
    """Whole minutes `stay` ran past the allowance; under a minute over isn't worth flagging."""
    over = int((stay - timedelta(minutes=allowed_minutes)).total_seconds() // 60)
    return max(over, 0)


def queue_allowance(route, extra_minutes):
    return (route.estimated_loading_minutes if route and route.estimated_loading_minutes else DEFAULT_ESTIMATED_LOADING_MINUTES) + extra_minutes


def _incident(t):
    queue = t.mode == 'QUEUE'
    stay = t.dispatched_at - t.loading_started_at if queue else t.checked_out_at - t.checked_in_at
    stay_minutes = int(stay.total_seconds() // 60)  # whole minutes, like overstay_minutes, so stay - allowed = over
    return {
        'kind': 'Queue' if queue else 'Roaming',
        'at': t.dispatched_at,
        'driver_id': t.driver_id,
        'driver': f"{t.driver.last_name}, {t.driver.first_name}".strip(),
        'plate': t.vehicle.plate_number,
        'route': t.route.origin if t.route else '',
        'stay_minutes': stay_minutes,
        'limit_minutes': queue_allowance(t.route, t.extra_loading_minutes) if queue else ROAM_LIMIT_MINUTES,
        'extended_minutes': t.extra_loading_minutes if queue else 0,
        'over_minutes': t.overstay_minutes,
    }


@api_view(['GET'])
def overstays(request):
    """Who held the loading bay past its estimate (plus any dispatcher extension) or roamed past
    5 minutes, per driver so repeat offenders stand out. The overstay is recorded on the ticket
    when the vehicle leaves, so this only reads it back — one incident per visit, however many
    tickets it drew. Visits from before that was recorded aren't listed."""
    params = request.query_params
    qs = Ticket.objects.filter(overstay_minutes__gt=0, status='COLLECTED', dispatched_at__isnull=False).select_related('driver', 'vehicle', 'route')
    try:
        if params.get('start_date'):
            qs = qs.filter(dispatched_at__gte=parse_date_start(params['start_date']))
        if params.get('end_date'):
            qs = qs.filter(dispatched_at__lte=parse_date_end(params['end_date']))
    except ValueError:
        pass

    visits = {}
    for t in qs.order_by('dispatched_at'):
        visits.setdefault(t.issuance_group or t.id, t)
    incidents = [_incident(t) for t in visits.values()]

    drivers = {}
    for i in incidents:
        d = drivers.setdefault(i['driver_id'], {
            'driver_id': i['driver_id'], 'driver': i['driver'], 'incidents': 0, 'queue': 0, 'roaming': 0,
            'total_over_minutes': 0, 'worst_minutes': 0, 'last_at': i['at'],
        })
        d['incidents'] += 1
        d['queue' if i['kind'] == 'Queue' else 'roaming'] += 1
        d['total_over_minutes'] += i['over_minutes']
        d['worst_minutes'] = max(d['worst_minutes'], i['over_minutes'])
        d['last_at'] = max(d['last_at'], i['at'])

    return Response({
        'drivers': sorted(drivers.values(), key=lambda d: (-d['incidents'], -d['total_over_minutes'], d['driver'])),
        'incidents': sorted(incidents, key=lambda i: i['at'], reverse=True),
    })
