import json
import os
from datetime import datetime, timedelta, timezone as dt_timezone

from django.conf import settings
from django.utils import timezone

from ..models import Ticket, TicketPrice


def load_schedule():
    schedule_path = os.path.join(settings.BASE_DIR, "schedules.json")
    with open(schedule_path, "r") as f:
        return json.load(f)


def get_batch(ticket):
    local_hour = (ticket.issued_at + timedelta(hours=8)).hour
    schedule = load_schedule()
    for key, shift in schedule.items():
        if shift["startHour"] <= local_hour < shift["endHour"]:
            return key
    return None


def parse_date_start(date_str):
    d = datetime.strptime(date_str, '%Y-%m-%d')
    ph_start = datetime(d.year, d.month, d.day, 0, 0, 0)
    return timezone.make_aware(ph_start - timedelta(hours=8))


def parse_date_end(date_str):
    d = datetime.strptime(date_str, '%Y-%m-%d')
    ph_end = datetime(d.year, d.month, d.day, 23, 59, 59)
    return timezone.make_aware(ph_end - timedelta(hours=8))


def get_batch_code(batch_name):
    schedule = load_schedule()
    codes = {name.replace("_", " ").title(): str(shift["startHour"]).zfill(2) for name, shift in schedule.items()}
    return codes.get(batch_name, "00")


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


def generate_ticket_id(issued_at, batch_name):
    local_dt = issued_at + timedelta(hours=8)
    date_code = local_dt.strftime('%Y%m%d')
    prefix = f'{date_code}{get_batch_code(batch_name)}'
    last_ticket = Ticket.objects.filter(id__startswith=prefix).order_by('-id').first()
    if last_ticket:
        last_seq = int(last_ticket.id[-4:]) if last_ticket.id[-4:].isdigit() else 0
        next_seq = str(last_seq + 1).zfill(4)
    else:
        next_seq = '0001'
    return f'{prefix}{next_seq}'


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


def summarize(ticket_list, fallback_amount=0.0):
    count = len(ticket_list)
    total = round(sum(
        float(t.collection_amount) if (t.collection_amount is not None and float(t.collection_amount) > 0) else fallback_amount
        for t in ticket_list
    ), 2)
    return {'count': count, 'total': total}
