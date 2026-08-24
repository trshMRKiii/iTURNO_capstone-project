import csv
import io
from datetime import datetime, timedelta
from decimal import Decimal, InvalidOperation

from django.db import transaction
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from ..models import Ticket, Vehicle, Driver, Route, TicketForm, User, WipMode
from ..serializers import WipModeSerializer
from .helpers import record_audit_log
from .viewsets import IsSupervisorOrAdminForWrite

# Column/field names, shared by the CSV header row and the manual-entry JSON
# payload (both funnel through _resolve_row below). Plain-English on purpose —
# the person filling these out is terminal staff working from a paper ticket
# during an outage, not a developer, so the names match what they'd recognize
# from elsewhere in the app (e.g. "IWP Number" on the Driver Registry form)
# rather than internal field names like plate_number/driver_iwp_number.
F_TICKET_ID = 'Ticket Number'
F_PLATE = 'Vehicle Plate Number'
F_DRIVER_IWP = 'Driver IWP Number'
F_DRIVER_LAST = 'Driver Last Name'
F_DRIVER_FIRST = 'Driver First Name'
F_ROUTE = 'Route'
F_TICKET_TYPE = 'Ticket Type'
F_AMOUNT = 'Amount'
F_ISSUED_AT = 'Date and Time Issued'
F_STAFF_EMAIL = 'Staff Email'
F_MODE = 'Mode'
F_NOTES = 'Notes'

REQUIRED_FIELDS = [F_TICKET_ID, F_PLATE, F_DRIVER_IWP, F_DRIVER_LAST]

# "Queue"/"Roaming" match the labels already used on the Queue Management page
# (queue.jsx); QUEUE/UNLOAD are the raw values Ticket.mode actually stores —
# both are accepted so a technical CSV built from other tooling still works.
MODE_ALIASES = {'QUEUE': 'QUEUE', 'ROAMING': 'UNLOAD', 'UNLOAD': 'UNLOAD'}


@api_view(['GET', 'PUT'])
@permission_classes([IsSupervisorOrAdminForWrite])
def wip_mode_config(request):
    config = WipMode.get_solo()
    if request.method == 'GET':
        return Response(WipModeSerializer(config).data)

    serializer = WipModeSerializer(config, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    record_audit_log(
        user=request.user, action='UPDATE', model_name='WipMode',
        object_id=config.pk, object_repr='WIP mode configuration',
        changes=request.data,
    )
    return Response(serializer.data)


def _resolve_driver(iwp_number, last_name, first_name=''):
    if not iwp_number or not last_name:
        return None, f"{F_DRIVER_IWP} and {F_DRIVER_LAST} are required"
    qs = Driver.objects.filter(iwp_number__iexact=iwp_number, last_name__iexact=last_name)
    count = qs.count()
    if count == 0:
        return None, f"Driver not found for {F_DRIVER_IWP}='{iwp_number}', {F_DRIVER_LAST}='{last_name}'"
    if count == 1:
        return qs.first(), None
    if first_name:
        qs2 = qs.filter(first_name__iexact=first_name)
        if qs2.count() == 1:
            return qs2.first(), None
    return None, f"Ambiguous: {count} drivers match — add {F_DRIVER_FIRST} to disambiguate"


def _parse_ph_datetime(value):
    # Same "PH-local in, UTC-aware out" idiom as helpers.parse_date_start/_end.
    dt = datetime.strptime(value.strip(), '%Y-%m-%d %H:%M')
    return timezone.make_aware(dt - timedelta(hours=8))


def _resolve_row(row, existing_ids_in_batch):
    """Validate + resolve FKs for one row. Returns (resolved_dict_or_None, outcome, reason)
    where outcome is 'ok' | 'duplicate' | 'error'. Never writes anything — shared by the
    CSV loop, the manual-entry endpoint, and both endpoints' dry-run path."""
    get = lambda k: (row.get(k) or '').strip()
    ticket_id = get(F_TICKET_ID)

    if not ticket_id:
        return None, 'error', f'Missing {F_TICKET_ID}'
    if ticket_id in existing_ids_in_batch or Ticket.objects.filter(id=ticket_id).exists():
        return None, 'duplicate', 'This ticket number already exists'

    vehicle = Vehicle.objects.filter(plate_number__iexact=get(F_PLATE)).first()
    if not vehicle:
        return None, 'error', f"Vehicle not found: {F_PLATE}='{get(F_PLATE)}'"

    driver, err = _resolve_driver(get(F_DRIVER_IWP), get(F_DRIVER_LAST), get(F_DRIVER_FIRST))
    if err:
        return None, 'error', err

    route = None
    if get(F_ROUTE):
        route = Route.objects.filter(origin__iexact=get(F_ROUTE)).first()
        if not route:
            return None, 'error', f"Route not found: {F_ROUTE}='{get(F_ROUTE)}'"

    collection_amount = None
    if get(F_AMOUNT):
        try:
            collection_amount = Decimal(get(F_AMOUNT))
        except InvalidOperation:
            return None, 'error', f"Invalid {F_AMOUNT}: '{get(F_AMOUNT)}'"
    elif get(F_TICKET_TYPE):
        form = TicketForm.objects.filter(name__iexact=get(F_TICKET_TYPE)).first()
        if not form:
            return None, 'error', f"{F_TICKET_TYPE} not found: '{get(F_TICKET_TYPE)}'"
        collection_amount = form.price
    # else: leave None — Ticket.save() auto-fills from the latest TicketPrice.

    mode_input = (get(F_MODE) or 'QUEUE').upper()
    mode = MODE_ALIASES.get(mode_input)
    if mode is None:
        return None, 'error', f"Invalid {F_MODE}: '{get(F_MODE)}' (use Queue or Roaming)"

    active_user = None
    if get(F_STAFF_EMAIL):
        active_user = User.objects.filter(username__iexact=get(F_STAFF_EMAIL)).first()
        if not active_user:
            return None, 'error', f"Staff not found: {F_STAFF_EMAIL}='{get(F_STAFF_EMAIL)}'"

    historical_dt = None
    if get(F_ISSUED_AT):
        try:
            historical_dt = _parse_ph_datetime(get(F_ISSUED_AT))
        except ValueError:
            return None, 'error', f"Invalid {F_ISSUED_AT} (expected YYYY-MM-DD HH:MM): '{get(F_ISSUED_AT)}'"

    return {
        'ticket_id': ticket_id, 'vehicle': vehicle, 'driver': driver, 'route': route,
        'mode': mode, 'collection_amount': collection_amount, 'active_user': active_user,
        'historical_dt': historical_dt, 'reason': get(F_NOTES),
    }, 'ok', None


def _create_ticket(resolved):
    """Writes one Ticket row for an already-resolved dict. Uses .create() (not
    bulk_create()) so the post_save signal fires and queues it for Supabase sync
    (see api/sync/signals.py) — required, not optional. series is intentionally
    left unset: _consume_series_fifo (viewsets.py) tracks series stock by count,
    not by which numbers are taken, so attaching a backfilled ticket to a live
    series could corrupt that series' remaining-stock arithmetic."""
    with transaction.atomic():
        ticket = Ticket.objects.create(
            id=resolved['ticket_id'], vehicle=resolved['vehicle'], driver=resolved['driver'],
            route=resolved['route'], mode=resolved['mode'], status='COLLECTED', is_verified=True,
            collection_amount=resolved['collection_amount'], active_user=resolved['active_user'],
            active_user_name='' if resolved['active_user'] else 'Paper Backfill',
            dispatched_at=resolved['historical_dt'] or timezone.now(), reason=resolved['reason'],
        )
        if resolved['historical_dt']:
            # issued_at/created_at are auto_now_add=True — .create() always forces
            # them to now() regardless of what's passed in (Field.pre_save()). Only
            # a follow-up .update() (bypasses pre_save()) can backdate them, and it
            # must happen after .create() so the post_save signal above still fires.
            Ticket.objects.filter(pk=ticket.pk).update(
                issued_at=resolved['historical_dt'], created_at=resolved['historical_dt']
            )
    return ticket


@api_view(['POST'])
@permission_classes([IsSupervisorOrAdminForWrite])
def backfill_manual(request):
    """Single-row entry. commit=false (default) previews without writing."""
    commit = bool(request.data.get('commit'))
    resolved, outcome, reason = _resolve_row(request.data, existing_ids_in_batch=set())
    if outcome != 'ok':
        return Response({'outcome': outcome, 'reason': reason}, status=200)
    if commit:
        ticket = _create_ticket(resolved)
        record_audit_log(
            user=request.user, action='CREATE', model_name='Ticket',
            object_id=ticket.pk, object_repr=f"Manual backfill: {ticket.pk}",
            changes={'source': 'manual_backfill'},
        )
    return Response({
        'outcome': 'ok', 'committed': commit, 'ticket_id': resolved['ticket_id'],
        'vehicle': resolved['vehicle'].plate_number, 'driver': str(resolved['driver']),
        'route': resolved['route'].full_name if resolved['route'] else None,
        'collection_amount': float(resolved['collection_amount']) if resolved['collection_amount'] is not None else None,
    })


def _read_csv_rows(file_obj):
    if not file_obj:
        return None, Response({"error": "No file provided"}, status=400)
    try:
        # utf-8-sig strips a leading BOM — Excel's default CSV export includes one,
        # which would otherwise glue a stray character onto the first header name.
        decoded = file_obj.read().decode('utf-8-sig')
    except UnicodeDecodeError:
        return None, Response({"error": "File must be UTF-8 encoded CSV"}, status=400)
    reader = csv.DictReader(io.StringIO(decoded))
    fieldnames = [f.strip() for f in (reader.fieldnames or [])]
    missing = [c for c in REQUIRED_FIELDS if c not in fieldnames]
    if missing:
        return None, Response({"error": f"Missing required column(s): {', '.join(missing)}"}, status=400)
    return list(reader), None


def _process_csv(rows, commit):
    seen, imported, skipped, errors = set(), [], [], []
    for i, row in enumerate(rows, start=1):  # counts data rows only, header excluded
        resolved, outcome, reason = _resolve_row(row, seen)
        ticket_id = (row.get(F_TICKET_ID) or '').strip()
        if outcome == 'error':
            errors.append({'row': i, 'ticket_id': ticket_id, 'reason': reason})
            continue
        if outcome == 'duplicate':
            skipped.append({'row': i, 'ticket_id': ticket_id, 'reason': reason})
            seen.add(ticket_id)
            continue
        if commit:
            try:
                _create_ticket(resolved)
            except Exception as exc:
                errors.append({'row': i, 'ticket_id': ticket_id, 'reason': f"Save failed: {exc}"})
                continue
        seen.add(ticket_id)
        imported.append({
            'row': i, 'ticket_id': ticket_id, 'vehicle': resolved['vehicle'].plate_number,
            'driver': str(resolved['driver']),
        })
    return {
        'total_rows': len(imported) + len(skipped) + len(errors),
        'imported_count': len(imported), 'skipped_count': len(skipped), 'error_count': len(errors),
        'imported': imported, 'skipped': skipped, 'errors': errors,
    }


@api_view(['POST'])
@permission_classes([IsSupervisorOrAdminForWrite])
def backfill_preview(request):
    rows, err = _read_csv_rows(request.FILES.get('file'))
    if err:
        return err
    return Response({**_process_csv(rows, commit=False), 'dry_run': True})


@api_view(['POST'])
@permission_classes([IsSupervisorOrAdminForWrite])
def backfill_import(request):
    file_obj = request.FILES.get('file')
    rows, err = _read_csv_rows(file_obj)
    if err:
        return err
    result = _process_csv(rows, commit=True)
    record_audit_log(
        user=request.user, action='CREATE', model_name='Ticket',
        object_id='', object_repr=f"CSV backfill ({file_obj.name})",
        changes={
            'imported_count': result['imported_count'],
            'skipped_count': result['skipped_count'],
            'error_count': result['error_count'],
        },
    )
    return Response({**result, 'dry_run': False})
