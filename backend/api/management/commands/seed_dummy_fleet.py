"""Wipe transactional/fleet data and reseed North Central Terminal (San Fernando,
La Union) with a dummy fleet: 100 vehicles, 100 drivers, spread across whatever
routes are currently registered and active, and ~5 months of backdated ticket
history for scale/stress testing.

Each day's tickets land in one of three buckets, mirroring how the real Queue
page groups them (see queue.jsx): most resolve COLLECTED (dispatched, with a
queue wait from issued_at to dispatched_at centered on that vehicle's own
route's configured loading-time estimate -- Settings -> Routes, ~5 minutes for
most routes here), a small fraction end CANCELLED (scattered across the whole
history, not just one day -- a check-in can be cancelled any day), and
mode=UNLOAD ("roam") tickets are born already collected on the spot with no
queue wait at all. The one exception is the final day (today): a handful of
its QUEUE-mode tickets are left genuinely QUEUED (no dispatched_at) to
simulate vehicles still waiting in line right now, since a ticket can't
realistically stay unresolved for months.

Pass --keep-fleet to leave existing Driver/Vehicle rows untouched and only
wipe+regenerate the transactional half (tickets/requisitions/series) --
useful for rerunning the history without reshuffling driver/vehicle identities.

Every COLLECTED transaction is issued as a group of however many ticket units
hit the configured Terminal Price exactly (see dispatch_ticket / roam check-in's
price*quantity == terminal_price guard in views/viewsets.py) -- e.g. with a P10
terminal price, a P2 ticket is only ever issued 5-at-a-time, never alone --
so daily remittance totals are always a clean multiple of that terminal price,
same as real collections. --daily-avg/--daily-cap count physical Ticket rows
(what the app itself calls a "check-out" -- see checkout_count in
views/reports.py), not transactions -- a single P2 transaction contributes 5
of those rows at once, so the day's transaction count comes out lower than
its row count whenever P2 transactions land.

Leaves User/Route(existing)/PUVType/TicketForm/WipMode untouched —
those are the Supabase-authoritative PULL_MODELS (see api/sync/registry.py),
also what Settings -> General manages.

Requisition ids continue from whatever the highest existing id was, instead of
resetting to 1, per the old-ID-as-reference request.

Ticket history is generated with bulk_create for speed, which means Django
never fires the post_save signal that would normally queue each row into
SyncQueue (api/sync/signals.py) -- so matching SyncQueue rows are inserted
directly here to get the same "queued for push" effect without 30-40k
individual signal-triggered saves.

The wipe/fleet/routes/requisitions setup runs in one transaction, but the
~4-month ticket history commits one day at a time instead of as part of that
same transaction -- holding a single multi-minute transaction open for the
whole history starves SQLite's WAL checkpointing (nothing can checkpoint
while a writer transaction is open), so the longer a giant single-transaction
run went, the slower every statement inside it got. Per-day commits also
mirror how tickets actually accumulate in real operation: incrementally, not
in one burst.
"""
import random
import uuid
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from api.models import (
    AuditLog, Collection, Deposit, Driver, PUVType, RemittanceBatch, Requisition,
    Route, SyncQueue, Ticket, TicketForm, TicketSeries, User, Vehicle,
)

BARANGAYS = [
    "Poblacion", "San Vicente", "San Isidro", "San Jose", "Santa Rita",
    "Santo Rosario", "Bacsil", "Cabaroan", "Nagsabaran", "Tammocalao",
    "Paringao", "Pagdalagan", "Dili", "Sipulo", "Cabuluan", "Camansi",
]

FIRST_NAMES_M = [
    "Juan", "Jose", "Antonio", "Ramon", "Ricardo", "Eduardo", "Roberto",
    "Danilo", "Ernesto", "Rodrigo", "Marlon", "Reynaldo", "Arnel", "Bienvenido",
    "Cesar", "Domingo", "Efren", "Federico", "Gilbert", "Herminio", "Isagani",
    "Jaime", "Leonardo", "Mario", "Noel",
]
FIRST_NAMES_F = [
    "Maria", "Rosario", "Teresita", "Corazon", "Elena", "Josefina", "Amalia",
    "Bernadette", "Carmelita", "Divina", "Estrella", "Feliza", "Gloria",
    "Herminia", "Imelda", "Julieta", "Lourdes", "Milagros", "Nenita", "Perla",
]
LAST_NAMES = [
    "Reyes", "Santos", "Cruz", "Bautista", "Ocampo", "Garcia", "Mendoza",
    "Torres", "Flores", "Rivera", "Villanueva", "Castro", "Aquino", "Domingo",
    "Ramos", "Salvador", "Pascual", "Navarro", "Gonzales", "Manalo", "Sagun",
    "Bjuan", "Rimando", "Peralta", "Agbayani", "Baltazar",
]


# Most Filipino given names are a single word, but compound first names
# ("Juan Carlos", rarely "Juan Carlos Miguel") are common enough to show up
# in a 100-driver roster -- weighted so they stay the minority.
def _rand_first_name(gender):
    pool = FIRST_NAMES_M if gender == "MALE" else FIRST_NAMES_F
    word_count = random.choices([1, 2, 3], weights=[75, 20, 5])[0]
    words = random.sample(pool, k=min(word_count, len(pool)))
    return " ".join(words)


def _rand_name(gender):
    first = _rand_first_name(gender)
    middle = random.choice(LAST_NAMES)
    last = random.choice(LAST_NAMES)
    return first, middle, last


def _rand_plate(used):
    while True:
        plate = f"{''.join(random.choices('ABCDEFGHJKLMNPRSTUVWXYZ', k=3))} {random.randint(1000, 9999)}"
        if plate not in used:
            used.add(plate)
            return plate


# Fixed test-number pool -- matches the numbers actually used for testing
# instead of generating unreachable random ones.
CONTACT_NUMBERS = ["09763317056", "09953658074", "09456780183"]


def _rand_contact():
    return random.choice(CONTACT_NUMBERS)


# Mirrors DEFAULT_ESTIMATED_LOADING_MINUTES in views/records.py -- the queue
# wait fallback for a route with no estimated_loading_minutes configured.
DEFAULT_ESTIMATED_LOADING_MINUTES = 5


def _denominate(total):
    """Split a peso amount into a plausible bill/coin breakdown, greedy by denomination."""
    remaining = int(total)
    rows = []
    for denom in (1000, 500, 200, 100, 50, 20):
        if remaining < denom:
            continue
        qty = remaining // denom
        remaining -= qty * denom
        rows.append(("bill" if denom >= 20 else "coin", denom, qty))
    for denom in (10, 5, 1):
        if remaining <= 0:
            break
        qty = remaining // denom
        if qty:
            remaining -= qty * denom
            rows.append(("coin", denom, qty))
    return rows


class Command(BaseCommand):
    help = "Wipe transactional/fleet data and reseed a dummy North Central Terminal fleet + ticket history."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Print what would happen without writing anything.")
        parser.add_argument("--months", type=int, default=5, help="How many months of ticket history to backdate.")
        parser.add_argument(
            "--daily-avg", type=int, default=180,
            help="Average physical Ticket rows (app's own 'check-out' count) per day, combining "
                 "roaming (UNLOAD) and queueing (QUEUE) modes.",
        )
        parser.add_argument(
            "--daily-cap", type=int, default=250,
            help="Hard cap on physical Ticket rows per day, matching the terminal's observed busiest days.",
        )
        parser.add_argument(
            "--cancelled-rate", type=float, default=0.02,
            help="Fraction of tickets, spread across the whole history, that end up CANCELLED instead of COLLECTED.",
        )
        parser.add_argument(
            "--keep-fleet", action="store_true",
            help="Leave existing Driver/Vehicle rows alone; only wipe and regenerate tickets/requisitions/series.",
        )
        parser.add_argument("--seed", type=int, default=None, help="Random seed for reproducible runs.")

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        months = options["months"]
        daily_avg = options["daily_avg"]
        daily_cap = options["daily_cap"]
        cancelled_rate = options["cancelled_rate"]
        keep_fleet = options["keep_fleet"]
        if options["seed"] is not None:
            random.seed(options["seed"])

        ticket_stats = {"created": 0, "days": 0}
        with transaction.atomic():
            ctx = self._setup(dry_run, keep_fleet, months, daily_cap)
            if ctx is not None and not dry_run:
                ticket_stats = self._generate_history(ctx, months, daily_avg, daily_cap, cancelled_rate)
            if dry_run:
                transaction.set_rollback(True)

        if ctx is None:
            return

        self._report(dry_run, ctx, ticket_stats)

    def _compute_form_quantities(self, ticket_forms):
        """How many units of each form make up one COLLECTED transaction --
        whatever quantity makes price*quantity hit the terminal price exactly
        (see the guard in views/viewsets.py's dispatch_ticket / roam check-in).
        Shared by _setup (to size each form's series generously enough to
        never run dry) and _generate_day (to actually issue that many)."""
        # Terminal price is per PUV type now; the dummy fleet is Jeepney-based.
        terminal_price = PUVType.objects.filter(name="Jeepney").values_list("terminal_price", flat=True).first() or 0
        quantities = {}
        for form in ticket_forms:
            if terminal_price and form.price and terminal_price % form.price == 0:
                quantities[form.id] = int(terminal_price / form.price)
            else:
                quantities[form.id] = 1
        return quantities

    def _setup(self, dry_run, keep_fleet=False, months=5, daily_cap=250):
        """Wipe PUSH_MODELS and recreate routes/drivers/vehicles/requisitions/series
        (or, with keep_fleet, only the transactional half -- requisitions/series/
        tickets -- reusing whatever Driver/Vehicle rows already exist).
        Returns a context dict for _generate_history/_report, or None if reference
        data (TicketForm/PUVType/User) is missing and nothing was done.
        """
        old_max_requisition_id = Requisition.objects.aggregate(m=Max("id"))["m"] or 0

        before = {
            "vehicles": Vehicle.objects.count(),
            "drivers": Driver.objects.count(),
            "tickets": Ticket.objects.count(),
            "requisitions": Requisition.objects.count(),
            "remittance_batches": RemittanceBatch.objects.count(),
        }

        ticket_forms = list(TicketForm.objects.all())
        puv_types = list(PUVType.objects.all())
        jeepney = next((p for p in puv_types if p.name == "Jeepney"), puv_types[0] if puv_types else None)
        routes = list(Route.objects.filter(is_active=True))
        admin_user = User.objects.filter(role="SUPERADMIN").first() or User.objects.first()
        staff_users = list(User.objects.filter(role__in=["PERSONNEL", "SUPERVISOR", "MANAGER"])) or [admin_user]

        if not ticket_forms or not puv_types or not admin_user or not routes:
            self.stderr.write(self.style.ERROR(
                "Missing reference data (TicketForm/PUVType/Route/User) -- run this after normal app setup, not on a bare DB."
            ))
            return None

        if keep_fleet and not (Driver.objects.exists() and Vehicle.objects.exists()):
            self.stderr.write(self.style.ERROR(
                "--keep-fleet needs existing Driver/Vehicle rows to reuse -- there are none, run without it first."
            ))
            return None

        # Clear the outbox *before* wiping, not after: each delete below fires
        # api/sync/signals.py's post_delete hook, which queues a pending_delete
        # SyncQueue row so the same wipe eventually happens on the Supabase
        # mirror too. Clearing SyncQueue afterwards would discard exactly those
        # rows, leaving the old data stranded on Supabase forever instead of
        # actually being replaced.
        SyncQueue.objects.all().delete()

        if keep_fleet:
            # Driver/Vehicle stay put -- only the transactional history goes.
            # Ticket would otherwise only be cleared as a side effect of the
            # Vehicle/Driver cascade below, so it needs an explicit delete here.
            Ticket.objects.all().delete()
        else:
            # Cascades: Vehicle -> Ticket (CASCADE), Driver -> any leftover Ticket (CASCADE).
            Vehicle.objects.all().delete()
            Driver.objects.all().delete()
        # Cascades: RemittanceBatch -> Deposit/Collection (CASCADE),
        # Requisition -> TicketSeries (CASCADE).
        RemittanceBatch.objects.all().delete()
        Requisition.objects.all().delete()
        AuditLog.objects.all().delete()

        # --- Routes -- reuse whatever's currently registered and active,
        # instead of a hardcoded town list that drifts out of sync with it.
        routes_by_town = {r.origin: r for r in routes}
        towns = list(routes_by_town.keys())

        if keep_fleet:
            # Reuse whatever's already there instead of wiping identities.
            drivers = list(Driver.objects.all())
            vehicles = list(Vehicle.objects.all())
        else:
            # --- Drivers (100) ---------------------------------------------
            drivers = []
            for i in range(1, 101):
                gender = random.choice(["MALE", "MALE", "FEMALE"])  # jeepney driving skews male, not exclusively
                first, middle, last = _rand_name(gender)
                town = random.choice(towns)
                driver = Driver(
                    iwp_number=f"IWP-{2024 + (i % 3)}-{i:04d}",
                    first_name=first,
                    middle_name=middle,
                    last_name=last,
                    gender=gender,
                    birthdate=date(random.randint(1968, 2001), random.randint(1, 12), random.randint(1, 28)),
                    province="La Union",
                    city=town,
                    barangay=random.choice(BARANGAYS),
                    street=f"{random.randint(1, 200)} {random.choice(['Rizal', 'Bonifacio', 'Mabini', 'National Highway', 'Quezon'])} St.",
                    contact=_rand_contact(),
                    status="ACTIVE" if i > 6 else "INACTIVE",  # a few inactive for realism
                )
                drivers.append(driver)

            if not dry_run:
                for d in drivers:
                    d.save()  # small volume (100) -- normal save() so it queues into SyncQueue like real data
                    d.qr_code = d.iwp_number
                    d.save(update_fields=["qr_code"])

            # --- Vehicles (100) ----------------------------------------------
            used_plates = set()
            vehicles = []
            # Only ACTIVE drivers get assigned as a vehicle's active_driver -- an
            # inactive one can't legally check in (see TicketSerializer.create's
            # driver.status != 'ACTIVE' guard), so pairing one with a vehicle would
            # leave that vehicle unable to ever queue.
            assignable_drivers = [d for d in drivers if d.status == "ACTIVE"]
            for i in range(100):
                town = random.choice(towns)
                driver = assignable_drivers[i] if i < len(assignable_drivers) else None
                vehicle = Vehicle(
                    plate_number=_rand_plate(used_plates),
                    transportation_id=jeepney,  # the fleet is Jeepney-only in practice
                    franchise_number=f"{random.randint(2018, 2025)}-LTFRB-{random.randint(10000, 99999)}",
                    route=routes_by_town[town],
                    operator_address=f"{random.choice(BARANGAYS)}, {town}, La Union",
                    status="AVAILABLE",
                    owner_driver=driver,
                    active_driver=driver,
                )
                vehicles.append(vehicle)

            if not dry_run:
                for v in vehicles:
                    v.save()
                    v.qr_code = v.plate_number
                    v.save(update_fields=["qr_code"])

        # --- Requisition (continues old id sequence) + TicketSeries -------
        requisitions = []
        next_id = old_max_requisition_id + 1
        for i, form in enumerate(ticket_forms):
            req = Requisition(
                id=next_id + i,
                requested_by=admin_user,
                approved_by_name=f"{admin_user.first_name} {admin_user.last_name}".strip() or admin_user.username,
                status="ISSUED",
                total_value=Decimal("0"),
            )
            requisitions.append(req)

        series_list = []
        if not dry_run:
            for req in requisitions:
                req.save()

            # Ticket.id is a single global primary key (not scoped per series/form),
            # same as real physical ticket books at the terminal -- so each series
            # needs a non-overlapping slice of the number line, not its own 1..N.
            # Each form gets its own numeric range instead of one shared counter:
            # the leading digit is the ticket price's own leading digit (1 for the
            # P10 form, 2 for the P2 form), so ranges can never collide across
            # forms and the ticket number alone tells you the denomination --
            # e.g. 1012100001, 1012100002, ... vs 2012100001, 2012100002, ...
            # series_no is just that same range's start_no, kept purely numeric
            # (no "CASHTICKETS-0-0" style label).
            #
            # Each form's range is sized off *ticket units*, not transactions: a
            # cheaper form needs more units per transaction to hit the terminal
            # price (a P2 form needs 5 units for every 1 a P10 form needs) -- a
            # flat range per form previously starved the P2 form's stock well
            # before the P10 form's, well within one history run. Sized against
            # the worst case (every single day at daily-cap, all of it this one
            # form) so it can never run dry regardless of how the random mode/
            # cancellation split actually lands.
            form_quantities = self._compute_form_quantities(ticket_forms)
            worst_case_days = months * 31 + 10
            for i, (req, form) in enumerate(zip(requisitions, ticket_forms)):
                form_code = str(int(form.price))[0]
                next_ticket_no = int(form_code) * 10**9 + 12_100_001
                per_series_size = max(20000, (worst_case_days * daily_cap * form_quantities[form.id]) // 2)
                for s in range(2):  # 2 series per form
                    start_no = next_ticket_no
                    end_no = start_no + per_series_size - 1
                    next_ticket_no = end_no + 1
                    series = TicketSeries(
                        series_no=str(start_no),
                        ticket_form=form,
                        start_no=str(start_no),
                        end_no=str(end_no),
                        unit_value=form.price,
                        total_value=form.price * (end_no - start_no + 1),
                        requisition=req,
                        issued_to=admin_user,
                        date_issued=timezone.now(),
                    )
                    series.save()
                    series_list.append(series)
                req.total_value = sum((s.total_value for s in series_list if s.requisition_id == req.id), Decimal("0"))
                req.save(update_fields=["total_value"])

        return {
            "before": before,
            "old_max_requisition_id": old_max_requisition_id,
            "requisitions": requisitions,
            "ticket_forms": ticket_forms,
            "staff_users": staff_users,
            "vehicles": vehicles,
            "driver_count": len(drivers),
            "vehicle_count": len(vehicles),
            "keep_fleet": keep_fleet,
            "series_list": series_list,
            "route_count": len(towns),
        }

    def _generate_history(self, ctx, months, daily_avg, daily_cap, cancelled_rate):
        ticket_forms = ctx["ticket_forms"]
        staff_users = ctx["staff_users"]
        series_list = ctx["series_list"]

        series_cursor = {s.id: int(s.start_no) for s in series_list}
        series_by_form = {}
        for s in series_list:
            series_by_form.setdefault(s.ticket_form_id, []).append(s)

        # Every COLLECTED transaction must total exactly the configured terminal
        # price (see dispatch_ticket / roam check-in's price*quantity ==
        # terminal_price guard in views/viewsets.py) -- so a form only ever gets
        # issued in whatever fixed quantity hits that total exactly (e.g. a P2
        # ticket 5-at-a-time against a P10 terminal price), never as a lone P2.
        form_quantities = self._compute_form_quantities(ticket_forms)

        available_vehicles = [v for v in ctx["vehicles"] if v.active_driver_id]
        today = timezone.localtime().date()
        start_day = today - timedelta(days=months * 30)

        ticket_stats = {"created": 0, "days": 0}

        day = start_day
        while day <= today:
            with transaction.atomic():
                self._generate_day(
                    day, today, daily_avg, daily_cap, cancelled_rate, form_quantities,
                    available_vehicles, ticket_forms, staff_users,
                    series_cursor, series_by_form, ticket_stats,
                )
            day += timedelta(days=1)

        return ticket_stats

    def _draw_ticket_no(self, form_id, series_by_form, series_cursor):
        """Pull the next physical ticket number for this form, falling over to
        the next series once the current one's range is exhausted. Returns
        (series, no), or (None, None) if every series for this form is spent."""
        form_series = series_by_form.get(form_id)
        while form_series:
            series = form_series[0]
            no = series_cursor[series.id]
            if no <= int(series.end_no):
                series_cursor[series.id] = no + 1
                return series, no
            form_series = form_series[1:]
            series_by_form[form_id] = form_series
        return None, None

    def _generate_day(self, day, today, daily_avg, daily_cap, cancelled_rate, form_quantities,
                       available_vehicles, ticket_forms, staff_users,
                       series_cursor, series_by_form, ticket_stats):
        is_weekend = day.weekday() >= 5
        base = daily_avg * (0.5 if is_weekend else 1.0)
        # daily-avg/daily-cap count physical Ticket rows -- what the app itself
        # calls a "check-out" (EodReconciliation's checkout_count, in
        # views/reports.py, is literally len(COLLECTED tickets dispatched that
        # day)) -- not the higher-level transaction/issuance_group. A single P2
        # transaction still produces 5 of those rows, not 1, so the loop below
        # keeps adding transactions until their rows add up to the target,
        # rather than just counting transactions.
        target_rows = min(daily_cap, max(1, int(random.gauss(base, base * 0.15))))

        # --- Pass 1: decide each transaction's shape (mode/timing/outcome/
        # form) before any ticket numbers are drawn, so today's still-queued
        # picks (by issued_at, below) don't need any series bookkeeping undone.
        txns = []
        row_count = 0
        while row_count < target_rows:
            vehicle = random.choice(available_vehicles)
            mode = "UNLOAD" if random.random() < 0.1 else "QUEUE"

            hour = random.choices(
                range(5, 20),
                weights=[3, 5, 8, 8, 5, 4, 4, 4, 4, 4, 5, 6, 8, 6, 3],
            )[0]
            minute = random.randint(0, 59)
            dispatched_at = timezone.make_aware(datetime.combine(day, time(hour, minute)))

            if mode == "QUEUE":
                # Queue wait (check-in to dispatch) is centered on this route's
                # own configured loading-time estimate (Settings -> Routes),
                # not a flat number -- same DEFAULT_ESTIMATED_LOADING_MINUTES
                # fallback as views/records.py for a route without one set.
                route_minutes = (vehicle.route.estimated_loading_minutes if vehicle.route else None) \
                    or DEFAULT_ESTIMATED_LOADING_MINUTES
                wait_minutes = max(1, round(random.gauss(route_minutes, 1.5)))
            else:
                # Roam check-in collects on the spot -- no queue to wait in.
                wait_minutes = 0
            issued_at = dispatched_at - timedelta(minutes=wait_minutes)

            status = "CANCELLED" if random.random() < cancelled_rate else "COLLECTED"
            if status == "COLLECTED":
                form = random.choice(ticket_forms)
                quantity = form_quantities.get(form.id, 1)
            else:
                form, quantity = None, 1

            if row_count + quantity > daily_cap:
                break  # would blow the hard cap -- stop issuing for today

            txns.append({
                "vehicle": vehicle,
                "mode": mode,
                "on_duty": random.choice(staff_users),
                "issued_at": issued_at,
                "dispatched_at": dispatched_at,
                "status": status,
                "form": form,
                "quantity": quantity,
            })
            row_count += quantity

        if day == today:
            # Leave a handful of today's still-open QUEUE-mode check-ins
            # genuinely QUEUED instead of COLLECTED -- one vehicle can only
            # have one open ticket at a time, and real check-ins don't pick a
            # ticket_form/quantity until dispatch, so these become single,
            # price-less placeholders rather than a priced COLLECTED group.
            queue_candidates = [t for t in txns if t["mode"] == "QUEUE" and t["status"] == "COLLECTED"]
            queue_candidates.sort(key=lambda t: t["issued_at"], reverse=True)
            take = min(len(queue_candidates), random.randint(5, 20))
            seen_vehicles, left = set(), 0
            for t in queue_candidates:
                if left >= take:
                    break
                if t["vehicle"].id in seen_vehicles:
                    continue
                seen_vehicles.add(t["vehicle"].id)
                t["status"] = "QUEUED"
                left += 1

        # --- Pass 2: materialize Ticket rows.
        day_tickets = []
        day_form_totals = {}  # form_id -> [amount_sum, min_no, max_no]
        route_counters = {}

        for t in txns:
            vehicle, mode, on_duty = t["vehicle"], t["mode"], t["on_duty"]
            issued_at, status = t["issued_at"], t["status"]
            active_user_name = f"{on_duty.first_name} {on_duty.last_name}".strip() or on_duty.username
            issuance_group = uuid.uuid4().hex

            if status == "QUEUED":
                queue_code = ""
                if vehicle.route_id:
                    route_counters[vehicle.route_id] = route_counters.get(vehicle.route_id, 0) + 1
                    queue_code = f"{vehicle.route.acronym}-{route_counters[vehicle.route_id]}"
                ticket = Ticket(
                    id=f"PENDING-{uuid.uuid4().hex[:12]}",
                    vehicle=vehicle,
                    driver_id=vehicle.active_driver_id,
                    active_user=on_duty,
                    active_user_name=active_user_name,
                    route=vehicle.route,
                    mode=mode,
                    status="QUEUED",
                    is_verified=False,
                    queue_code=queue_code,
                    issued_at=issued_at,
                    dispatched_at=None,
                    issuance_group=issuance_group,
                )
                ticket._issued_at_fix = issued_at
                ticket._created_at_fix = issued_at
                day_tickets.append(ticket)
                vehicle.status = "QUEUED"
                vehicle.save(update_fields=["status", "updated_at"])
                continue

            if status == "CANCELLED":
                # Cancelled before a ticket_form/quantity was ever chosen (that
                # only happens at dispatch/roam check-in), so no series number
                # is consumed -- same placeholder shape as a QUEUED ticket.
                ticket = Ticket(
                    id=f"CANCELLED-{uuid.uuid4().hex[:12]}",
                    vehicle=vehicle,
                    driver_id=vehicle.active_driver_id,
                    active_user=on_duty,
                    active_user_name=active_user_name,
                    route=vehicle.route,
                    mode=mode,
                    status="CANCELLED",
                    is_verified=False,
                    issued_at=issued_at,
                    dispatched_at=None,
                    issuance_group=issuance_group,
                )
                ticket._issued_at_fix = issued_at
                ticket._created_at_fix = issued_at
                day_tickets.append(ticket)
                continue

            # COLLECTED -- issued as a group of whatever quantity of this form
            # hits the terminal price exactly, all sharing one issuance_group.
            form, quantity = t["form"], t["quantity"]
            group_min = group_max = None
            group_amount = Decimal("0")
            for _u in range(quantity):
                series, no = self._draw_ticket_no(form.id, series_by_form, series_cursor)
                if series is None:
                    break  # this form's series are exhausted -- issue fewer units than intended
                ticket = Ticket(
                    id=str(no),
                    vehicle=vehicle,
                    driver_id=vehicle.active_driver_id,
                    active_user=on_duty,
                    active_user_name=active_user_name,
                    route=vehicle.route,
                    mode=mode,
                    series=series,
                    status="COLLECTED",
                    collection_amount=form.price,
                    is_verified=True,
                    issued_at=issued_at,
                    dispatched_at=t["dispatched_at"],
                    issuance_group=issuance_group,
                )
                ticket._issued_at_fix = issued_at
                ticket._created_at_fix = issued_at
                day_tickets.append(ticket)
                group_amount += form.price
                group_min = no if group_min is None else min(group_min, no)
                group_max = no if group_max is None else max(group_max, no)

            if group_min is not None:
                totals = day_form_totals.setdefault(form.id, [Decimal("0"), group_min, group_max])
                totals[0] += group_amount
                totals[1] = min(totals[1], group_min)
                totals[2] = max(totals[2], group_max)

        if not day_tickets:
            return

        Ticket.objects.bulk_create(day_tickets, batch_size=1000)
        for t in day_tickets:
            t.issued_at = t._issued_at_fix
            t.created_at = t._created_at_fix
            t.updated_at = t._issued_at_fix
        Ticket.objects.bulk_update(
            day_tickets, ["issued_at", "dispatched_at", "created_at", "updated_at"], batch_size=1000
        )
        SyncQueue.objects.bulk_create(
            (SyncQueue(model_label="api.Ticket", object_id=t.id, synced_at=None) for t in day_tickets),
            batch_size=1000, ignore_conflicts=True,
        )
        ticket_stats["created"] += len(day_tickets)
        ticket_stats["days"] += 1

        # --- Daily remittance batch tied to this day's collections ---
        doy = day.timetuple().tm_yday
        batch_code = f"TER-{doy:03d}-{str(day.year)[-2:]}"
        total_amount = sum((v[0] for v in day_form_totals.values()), Decimal("0"))
        batch = RemittanceBatch.objects.create(
            batch_code=batch_code,
            issued_by=random.choice(staff_users),
            total_amount=total_amount,
            covers_date=day,
        )
        for form_id, (amount, min_no, max_no) in day_form_totals.items():
            form = next(f for f in ticket_forms if f.id == form_id)
            Collection.objects.create(
                batch=batch,
                ticket_form_no=form.name,
                from_no=str(min_no),
                to_no=str(max_no),
                amount=amount,
            )
        for kind, denom, qty in _denominate(total_amount):
            Deposit.objects.create(
                batch=batch, type=kind, denomination=denom, quantity=qty,
                deposit_amount=Decimal(denom) * qty,
            )

    def _report(self, dry_run, ctx, ticket_stats):
        before = ctx["before"]
        old_max_requisition_id = ctx["old_max_requisition_id"]
        requisitions = ctx["requisitions"]
        keep_fleet = ctx["keep_fleet"]
        fleet_wiped = "0 vehicles, 0 drivers (kept)" if keep_fleet else f"{before['vehicles']} vehicles, {before['drivers']} drivers"
        fleet_reseeded = f"{ctx['vehicle_count']} vehicles, {ctx['driver_count']} drivers (reused)" if keep_fleet \
            else f"{ctx['vehicle_count']} vehicles, {ctx['driver_count']} drivers"
        self.stdout.write(self.style.SUCCESS(
            f"{'[DRY RUN] ' if dry_run else ''}"
            f"Wiped: {fleet_wiped}, {before['tickets']} tickets, "
            f"{before['requisitions']} requisitions, {before['remittance_batches']} remittance batches.\n"
            f"Reseeded: {ctx['route_count']} routes, {fleet_reseeded}, "
            f"{len(requisitions)} requisitions (ids {old_max_requisition_id + 1}-{old_max_requisition_id + len(requisitions)}), "
            f"{ticket_stats['created']} tickets across {ticket_stats['days']} days."
        ))
