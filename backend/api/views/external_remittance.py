from datetime import timedelta

from django.db import transaction
from django.db.models import Count
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.status import HTTP_204_NO_CONTENT

from ..models import Collection, PaperIssuance, RemittanceBatch, Ticket, TicketSeries
from ..serializers import PaperIssuanceSerializer
from .helpers import paper_numbers_by_series, record_audit_log
from .viewsets import IsSupervisorOrAdminForWrite

REASONS = dict(PaperIssuance.REASON_CHOICES)


def _local_day(when):
    # Same PH-day bucketing the end-of-day reconciliation uses for expected cash.
    return (when + timedelta(hours=8)).date()


def _ticket_day(ticket):
    return _local_day(ticket.dispatched_at or ticket.issued_at)


def _plan(series_id, from_no, to_no):
    """Sorts the numbers from_no..to_no of one series into what the paper remittance covered:
    system tickets that can be marked remitted, and numbers nobody has used yet, which can
    only have been handed out on paper. Numbers already taken by another ticket (remitted,
    still queued, cancelled) or an earlier paper range are left alone. Writes nothing."""
    series = TicketSeries.objects.select_related('ticket_form').filter(pk=series_id).first()
    if not series:
        raise ValidationError("Choose a ticket series.")
    try:
        start, end = int(from_no), int(to_no)
    except (TypeError, ValueError):
        raise ValidationError("Enter the first and last ticket number.")
    if start > end or not (int(series.start_no) <= start and end <= int(series.end_no)):
        raise ValidationError(f"Numbers must sit inside {series.start_no}–{series.end_no}, first number first.")

    taken = {t.id: t for t in Ticket.objects.filter(id__in=[str(n) for n in range(start, end + 1)]).select_related('series__ticket_form')}
    paper = paper_numbers_by_series([series.id]).get(series.id, set())
    tickets = sorted(
        (t for t in taken.values()
         if t.series_id == series.id and not t.remittance_batch_id and t.status == 'COLLECTED' and t.is_verified),
        key=lambda t: int(t.id),
    )
    runs = []
    for n in range(start, end + 1):
        if str(n) in taken or n in paper:
            continue
        if runs and runs[-1][1] == n - 1:
            runs[-1][1] = n
        else:
            runs.append([n, n])
    return series, tickets, runs, len(taken) - len(tickets)


def _file_batches(tickets, user):
    """One batch per day, so each day's reconciliation sees the cash it was owed. A batch
    has no deposits: the money was already handed over outside the system."""
    by_day = {}
    for t in tickets:
        by_day.setdefault(_ticket_day(t), []).append(t)

    codes = []
    for day, day_tickets in sorted(by_day.items()):
        base = code = f"EXT-{day:%Y%m%d}"
        n = 2
        while RemittanceBatch.objects.filter(batch_code=code).exists():
            code, n = f"{base}-{n}", n + 1
        amount = sum(float(t.collection_amount or 0) for t in day_tickets)
        batch = RemittanceBatch.objects.create(batch_code=code, issued_by=user, issued_by_role=user.role, covers_date=day, total_amount=amount)
        series = day_tickets[0].series
        numbers = sorted(int(t.id) for t in day_tickets)
        Collection.objects.create(
            batch=batch, ticket_form_no=series.ticket_form.name if series.ticket_form else '',
            from_no=str(numbers[0]), to_no=str(numbers[-1]), amount=amount,
        )
        Ticket.objects.filter(pk__in=[t.id for t in day_tickets]).update(remittance_batch=batch)
        codes.append(code)
    return codes


def _series_options():
    """Every series still in use, with how many dispatched, verified, unremitted system
    tickets it has and where they start and end — what the tab offers to choose from."""
    by_series, used = {}, paper_numbers_by_series()  # used: every number a ticket or paper range already holds
    for series_id, ticket_id in Ticket.objects.filter(series__isnull=False).values_list('series_id', 'id'):
        if ticket_id.isdigit():
            used.setdefault(series_id, set()).add(int(ticket_id))
    for t in Ticket.objects.filter(status='COLLECTED', is_verified=True, remittance_batch__isnull=True, series__isnull=False):
        if t.id.isdigit():
            by_series.setdefault(t.series_id, []).append(int(t.id))
    out = []
    for series in TicketSeries.objects.filter(requisition__is_archived=False).select_related('ticket_form'):
        numbers = by_series.get(series.id, [])
        taken = used.get(series.id, set())
        # Lowest number nobody has used yet — where paper tickets in this booklet would start.
        next_free = next((n for n in range(int(series.start_no), int(series.end_no) + 1) if n not in taken), None)
        if not numbers and next_free is None:
            continue  # every number is already a remitted ticket or a recorded paper range
        out.append({
            'id': series.id, 'series_no': series.series_no,
            'ticket_form': series.ticket_form.name if series.ticket_form else '',
            'start_no': series.start_no, 'end_no': series.end_no,
            'count': len(numbers), 'first_no': min(numbers, default=None), 'last_no': max(numbers, default=None),
            'next_free': next_free,
        })
    return sorted(out, key=lambda s: (-s['count'], s['series_no']))


@api_view(['GET', 'POST'])
@permission_classes([IsSupervisorOrAdminForWrite])
def external_remittance(request):
    """Records cash that was already handed in outside the system (e.g. during an outage) for
    one range of ticket numbers. System tickets in the range stay in trip history and reports;
    they just stop counting as cash still owed. Unused numbers in the range were handed out on
    paper, so they're reserved as paper ranges dated `used_on` (required when there are any).
    Both save together or not at all. GET lists the series to choose from; POST previews unless commit is true."""
    if request.method == 'GET':
        return Response(_series_options())

    data = request.data
    reason = data.get('reason') or 'REMITTED_WITHOUT_SYSTEM'
    if reason not in REASONS:
        raise ValidationError("Unknown reason.")
    note = (data.get('note') or '').strip()
    user = request.user

    series, tickets, runs, skipped = _plan(data.get('series'), data.get('from_no'), data.get('to_no'))
    price = float(series.ticket_form.price if series.ticket_form else series.unit_value)
    paper_count = sum(b - a + 1 for a, b in runs)
    result = {
        'ticket_count': len(tickets), 'total_amount': round(sum(float(t.collection_amount or 0) for t in tickets), 2),
        'paper_count': paper_count, 'paper_amount': round(paper_count * price, 2), 'skipped': skipped,
        'committed': False,
    }
    if not data.get('commit'):
        return Response(result)
    if not tickets and not runs:
        raise ValidationError("Nothing in that range can be recorded.")

    if runs:
        used_on = str(data.get('used_on') or '')
        if not used_on:
            raise ValidationError({"used_on": "Enter the date the paper tickets were issued."})
        if used_on > _local_day(timezone.now()).isoformat():
            raise ValidationError({"used_on": "The date can't be in the future."})

    name = f"{user.first_name} {user.last_name}".strip() or user.username
    with transaction.atomic():
        codes = _file_batches(tickets, user) if tickets else []
        for run in runs:
            ser = PaperIssuanceSerializer(data={
                'series': series.id, 'from_no': run[0], 'to_no': run[1],
                'used_on': data['used_on'], 'reason': reason, 'note': note,
            })
            ser.is_valid(raise_exception=True)
            ser.save(recorded_by=user, recorded_by_name=name)
        record_audit_log(
            user=user, action='CREATE', model_name='RemittanceBatch', object_id=','.join(codes),
            object_repr=f"Remitted outside the system: {len(tickets)} system ticket(s), {paper_count} paper ticket(s)",
            changes={'source': 'external_remittance', 'reason': REASONS[reason], 'note': note, 'series': series.series_no,
                     'from_no': data.get('from_no'), 'to_no': data.get('to_no'),
                     'ticket_ids': [t.id for t in tickets], 'paper_runs': runs},
        )
    return Response({**result, 'committed': True, 'batches': codes})


@api_view(['GET'])
@permission_classes([IsSupervisorOrAdminForWrite])
def external_remittance_records(request):
    """What has been recorded outside the system so far, so a mistake can be undone: the
    batches that marked system tickets remitted, and the paper ranges not yet in a remittance."""
    batches = RemittanceBatch.objects.filter(batch_code__startswith='EXT-').annotate(ticket_count=Count('tickets'))         .prefetch_related('collections').order_by('-covers_date', '-id')
    paper = PaperIssuance.objects.filter(remittance_batch__isnull=True).select_related('series__ticket_form')
    return Response({
        'batches': [
            {'id': b.id, 'batch_code': b.batch_code, 'covers_date': b.covers_date, 'ticket_count': b.ticket_count,
             'total_amount': float(b.total_amount),
             'from_no': min((c.from_no for c in b.collections.all()), key=int, default=None),
             'to_no': max((c.to_no for c in b.collections.all()), key=int, default=None)}
            for b in batches
        ],
        'paper': PaperIssuanceSerializer(paper, many=True).data,
    })


@api_view(['DELETE'])
@permission_classes([IsSupervisorOrAdminForWrite])
def undo_external_remittance(request, batch_id):
    """Takes back a wrong "marked as remitted": the tickets count as cash still to remit again.
    Only batches made by this feature (EXT-…); real remittances are never touched here."""
    batch = RemittanceBatch.objects.filter(pk=batch_id, batch_code__startswith='EXT-').first()
    if not batch:
        raise ValidationError("That backfilled remittance no longer exists.")
    with transaction.atomic():
        ticket_ids = list(batch.tickets.values_list('id', flat=True))
        record_audit_log(
            user=request.user, action='DELETE', model_name='RemittanceBatch', object_id=batch.pk,
            object_repr=f"Undid backfilled remittance {batch.batch_code}: {len(ticket_ids)} ticket(s) count as unremitted again",
            changes={'source': 'external_remittance_undo', 'ticket_ids': ticket_ids, 'total_amount': str(batch.total_amount)},
        )
        batch.delete()  # tickets' remittance_batch is SET_NULL; its collections go with it
    return Response(status=HTTP_204_NO_CONTENT)
