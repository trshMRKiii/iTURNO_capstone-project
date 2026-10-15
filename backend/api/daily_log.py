"""Plain-CSV keeper of today's ticket transactions, for when the system is down.

Every vehicle visit (check-in through dispatch or cancellation) is one row in
backend/daily_transactions.csv, kept up to date the moment it changes, so staff
can still open the file and tally for remittance without waiting for the app
or database. The
file starts fresh each PH day: the first write of a new day truncates it, and
if nothing is written (e.g. the system stays down) yesterday's rows are left
intact rather than lost.
"""
import contextlib
import csv
import logging
import os
import threading
from decimal import Decimal
from datetime import datetime, timedelta, timezone as dt_timezone

from django.conf import settings
from django.db.models.signals import post_save, pre_save
from django.utils import timezone

from api.models import Ticket
from api.sync.signals import is_bulk_loading

logger = logging.getLogger("sync")

LOG_PATH = settings.BASE_DIR / "daily_transactions.csv"
# If staff have LOG_PATH open (Excel locks it), the full table goes here instead.
LATEST_PATH = settings.BASE_DIR / "daily_transactions_LATEST.csv"
# The app's own copy of the day's rows. Not a .csv so nobody opens (and locks) it —
# that's what guarantees a row is never lost to a locked LOG_PATH.
STATE_PATH = settings.BASE_DIR / "daily_transactions.state"
HEADER = [
    "Time In", "Time Out", "Status", "Queue Code", "Ticket No.", "Mode",
    "Plate No.", "Driver", "Route", "Amount", "Issued By",
]
TIME_IN, TIME_OUT, STATUS, QUEUE, TICKET_NO, MODE, PLATE, DRIVER, ROUTE, AMOUNT, ISSUED_BY = range(len(HEADER))
_lock = threading.Lock()


def _ph(dt):
    return dt + timedelta(hours=8)


def _fmt(dt):
    return _ph(dt).strftime("%Y-%m-%d %H:%M:%S")


def _is_new_day():
    try:
        return _ph(datetime.fromtimestamp(STATE_PATH.stat().st_mtime, dt_timezone.utc)).date() != _ph(timezone.now()).date()
    except FileNotFoundError:
        return True


def _load():
    try:
        with open(STATE_PATH, newline="", encoding="utf-8-sig") as f:
            rows = list(csv.reader(f))
    except FileNotFoundError:
        return []
    # A file from an older column layout (or hand-mangled) can't be merged into; start over.
    return [r for r in rows[1:] if len(r) == len(HEADER)] if rows and rows[0] == HEADER else []


def _new_visit(ticket):
    driver = ticket.driver
    return [
        _fmt(ticket.issued_at), "", ticket.status, ticket.queue_code, "", ticket.mode,
        ticket.vehicle.plate_number,
        f"{driver.last_name}, {driver.first_name}".strip(", "),
        ticket.route_name, "", ticket.active_user_name,
    ]


def _fold(rows, ticket, now):
    """Merge one ticket event into the day's rows: one row per vehicle visit.

    A queue check-in opens a row (status QUEUED, no ticket number yet); dispatch
    or cancellation closes that same row instead of adding another. Roam/unload
    tickets are born closed, so they get a finished row straight away.
    """
    plate = ticket.vehicle.plate_number
    time_out = _fmt(ticket.dispatched_at or now)
    open_visit = next((r for r in reversed(rows) if r[PLATE] == plate and r[STATUS] == "QUEUED"), None)

    if ticket.status == "QUEUED":
        if open_visit is None:  # extra units of one check-in share its row
            rows.append(_new_visit(ticket))
        return

    if ticket.status == "COLLECTED":
        same_dispatch = next(
            (r for r in reversed(rows) if r[PLATE] == plate and r[STATUS] == "COLLECTED" and r[TIME_OUT] == time_out),
            None,
        )
        if same_dispatch:  # quantity > 1: every unit of one dispatch lands on one row
            same_dispatch[TICKET_NO] += f", {ticket.id}"
            same_dispatch[AMOUNT] = str(Decimal(same_dispatch[AMOUNT] or 0) + (ticket.collection_amount or 0))
            return

    visit = open_visit
    if visit is None:
        visit = _new_visit(ticket)
        rows.append(visit)
    visit[TIME_OUT] = time_out
    visit[STATUS] = ticket.status
    visit[MODE] = ticket.mode
    if ticket.status == "COLLECTED":
        visit[TICKET_NO] = ticket.id
        visit[AMOUNT] = "" if ticket.collection_amount is None else str(ticket.collection_amount)
        visit[ISSUED_BY] = ticket.active_user_name or visit[ISSUED_BY]


def _write(path, rows):
    """Write-then-swap so a crash mid-write can't leave a half-written file."""
    tmp = path.with_name(path.name + ".tmp")
    try:
        # utf-8-sig so Excel shows accented names correctly when double-clicked.
        with open(tmp, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.writer(f)
            writer.writerow(HEADER)
            writer.writerows(rows)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        with contextlib.suppress(OSError):
            tmp.unlink()


def _append(ticket):
    now = timezone.now()
    with _lock:
        rows = [] if _is_new_day() else _load()
        _fold(rows, ticket, now)
        _write(STATE_PATH, rows)
        try:
            _write(LOG_PATH, rows)
            with contextlib.suppress(OSError):
                LATEST_PATH.unlink()
        except OSError:
            # Staff have the main file open. Keep the day's full table in a second
            # file so it's still current; the main file catches up once it's closed.
            logger.warning("daily_transactions.csv is locked; wrote %s instead", LATEST_PATH.name)
            _write(LATEST_PATH, rows)


def _remember_old_status(sender, instance, using, **kwargs):
    if using not in (None, "default") or is_bulk_loading():
        return
    instance._daily_log_old_status = (
        Ticket.objects.filter(pk=instance.pk).values_list("status", flat=True).first()
    )


def _record(sender, instance, created, using, **kwargs):
    # Same cross-DB-echo / restore guards as the sync and websocket signals.
    if using not in (None, "default") or is_bulk_loading():
        return
    if not created and getattr(instance, "_daily_log_old_status", None) == instance.status:
        return  # an edit that isn't a transaction (e.g. verified flag, queue reorder)
    # Paper backfills re-enter past days' tickets — not today's transactions.
    if instance.dispatched_at and _ph(instance.dispatched_at).date() != _ph(timezone.now()).date():
        return
    try:
        _append(instance)
    except Exception:
        # Never let a locked/unwritable file (e.g. open in Excel) block issuing a ticket.
        logger.exception("daily transaction log write failed for ticket %s", instance.pk)


def connect():
    pre_save.connect(_remember_old_status, sender=Ticket, weak=False, dispatch_uid="daily_log_pre")
    post_save.connect(_record, sender=Ticket, weak=False, dispatch_uid="daily_log_post")
