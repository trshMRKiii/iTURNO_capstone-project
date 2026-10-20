"""Wipe transactional/fleet data and reseed North Central Terminal (San Fernando,
La Union) with a dummy fleet: 100 Jeepney vehicles, each owned by one of 100
ACTIVE drivers, spread across the routes already registered in Settings ->
Routes (never created or renamed here), and 2 months of backdated ticket
history by default for scale/stress testing.

Drivers and vehicles are filled in exactly as the Driver / Vehicle registry
forms require (src/app/dashboard/driver/driver-utils.js, vehicle/vehicleHook.jsx):
12-digit IWP number + expiration date, real La Union municipality/barangay,
09XXXXXXXXX contact, plate ABC-1234, franchise YY-NNNNN + expiration date,
operator address built from the owner's address.

Ticket numbers come from 1000-ticket series chained contiguously per form: the
P10 form starts at 1020101001-1020102000, the P2 form at 2020101001-2020102000;
whenever a form's current series runs out a new requisition + series follows
(e.g. 1020102001-1020103000), dated the day it was needed.

Each day gets between --daily-min and --daily-max physical Ticket rows (the
app's own "check-out" count, see checkout_count in views/reports.py). Tickets
land in the buckets the Queue page groups them in: mostly COLLECTED (queue wait
centered on the vehicle's route loading-time estimate), a few CANCELLED
(spread over the whole history), and mode=UNLOAD ("roam") tickets collected on
the spot. Days are Philippine days (UTC+8, like every report in the app) and
history runs through yesterday, so nothing is dated in the future; each day has
a remittance batch whose tickets are linked to it (Ticket.remittance_batch).

Every COLLECTED transaction is issued as however many ticket units hit the
PUV type's Terminal Price exactly (a P2 ticket only ever 5-at-a-time against a
P10 terminal price), so daily remittance totals are clean multiples of it.

Pass --keep-fleet to leave existing Driver/Vehicle rows untouched and only
wipe+regenerate tickets/requisitions/series.

Leaves User/Route/PUVType/TicketForm/WipMode untouched -- the
Supabase-authoritative PULL_MODELS (api/sync/registry.py). Requisition ids
continue from the highest existing id. Tickets use bulk_create (no post_save),
so matching SyncQueue rows are inserted directly; history commits one day at a
time so SQLite's WAL can checkpoint instead of starving behind one huge
transaction.
"""
import random
import uuid
from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import F, Max
from django.utils import timezone

from api.models import (
    AuditLog, Collection, Deposit, Driver, PUVType, RemittanceBatch, Requisition,
    Route, SyncQueue, Ticket, TicketForm, TicketSeries, User, Vehicle,
)

# Real PSGC municipality -> barangay names, as the registry form's address selects return them.
ADDRESSES = {
    "Bacnotan": ["Agtipal", "Arosip", "Bacqui", "Bacsil", "Bagutot"],
    "Balaoan": ["Apatut", "Ar-arampang", "Baracbac Este", "Baracbac Oeste", "Bet-ang"],
    "Bauang": ["Acao", "Baccuit Norte", "Baccuit Sur", "Bagbag", "Ballay"],
    "Luna": ["Alcala (Pob.)", "Ayaoan", "Barangobong", "Barrientos", "Bungro"],
    "Naguilian": ["Aguioas", "Al-alinao Norte", "Al-alinao Sur", "Ambaracao Norte", "Angin"],
    "Rosario": ["Alipang", "Ambangonan", "Amlang", "Bacani", "Bani"],
    "City Of San Fernando (Capital)": ["Abut", "Apaleng", "Bacsil", "Bangbangolan", "Bangcusay"],
    "San Gabriel": ["Amontoc", "Apayao", "Balbalayang", "Bayabas", "Bucao"],
    "San Juan": ["Allangigan", "Aludaid", "Bacsayan", "Balballosa", "Bambanay"],
}

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
        plate = f"{''.join(random.choices('ABCDEFGHJKLMNPRSTUVWXYZ', k=3))}-{random.randint(1000, 9999)}"
        if plate not in used:
            used.add(plate)
            return plate


def _rand_iwp(used):
    while True:
        iwp = "".join(random.choices("0123456789", k=12))
        if iwp not in used:
            used.add(iwp)
            return iwp


def _ph(day, hour, minute=0):
    """UTC datetime for a Philippine wall-clock time (UTC+8), the same offset the
    backend uses everywhere it cuts a day (e.g. views/helpers.py parse_date_start)."""
    return timezone.make_aware(datetime.combine(day, time(hour, minute)) - timedelta(hours=8))


def _future_date(today, min_days, max_days):
    return today + timedelta(days=random.randint(min_days, max_days))


# Fixed test-number pool -- matches the numbers actually used for testing
# instead of generating unreachable random ones.
CONTACT_NUMBERS = ["09763317056", "09953658074", "09456780183"]


def _rand_contact():
    return random.choice(CONTACT_NUMBERS)


# Mirrors DEFAULT_ESTIMATED_LOADING_MINUTES in views/records.py -- the queue
# wait fallback for a route with no estimated_loading_minutes configured.
DEFAULT_ESTIMATED_LOADING_MINUTES = 5

# Tickets per series/booklet, e.g. 1020101001-1020102000.
SERIES_SIZE = 1000


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
        parser.add_argument("--months", type=int, default=2, help="How many months of ticket history to backdate.")
        parser.add_argument("--daily-min", type=int, default=130, help="Minimum physical Ticket rows (check-outs) per day.")
        parser.add_argument("--daily-max", type=int, default=210, help="Maximum physical Ticket rows (check-outs) per day.")
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
        daily_min = options["daily_min"]
        daily_max = options["daily_max"]
        cancelled_rate = options["cancelled_rate"]
        keep_fleet = options["keep_fleet"]
        if options["seed"] is not None:
            random.seed(options["seed"])

        ticket_stats = {"created": 0, "days": 0}
        with transaction.atomic():
            ctx = self._setup(dry_run, keep_fleet)
            if ctx is not None and not dry_run:
                ticket_stats = self._generate_history(ctx, months, daily_min, daily_max, cancelled_rate)
            if dry_run:
                transaction.set_rollback(True)

        if ctx is None:
            return

        self._report(dry_run, ctx, ticket_stats)

    def _compute_form_quantities(self, ticket_forms):
        """How many units of each form make up one COLLECTED transaction --
        whatever quantity makes price*quantity hit the terminal price exactly
        (see the guard in views/viewsets.py's dispatch_ticket / roam check-in).
        Used by _generate_day to issue that many."""
        # Terminal price is per PUV type now; the dummy fleet is Jeepney-based.
        terminal_price = PUVType.objects.filter(name="Jeepney").values_list("terminal_price", flat=True).first() or 0
        quantities = {}
        for form in ticket_forms:
            if terminal_price and form.price and terminal_price % form.price == 0:
                quantities[form.id] = int(terminal_price / form.price)
            else:
                quantities[form.id] = 1
        return quantities

    def _setup(self, dry_run, keep_fleet=False):
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
        routes = list(Route.objects.filter(is_active=True, is_archived=False))
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
            # No tickets left, so nobody is in line -- don't leave ghost QUEUED vehicles.
            Vehicle.objects.filter(status='QUEUED').update(status='AVAILABLE', active_driver=F('owner_driver'))
        else:
            # Cascades: Vehicle -> Ticket (CASCADE), Driver -> any leftover Ticket (CASCADE).
            Vehicle.objects.all().delete()
            Driver.objects.all().delete()
        # Cascades: RemittanceBatch -> Deposit/Collection (CASCADE),
        # Requisition -> TicketSeries (CASCADE).
        RemittanceBatch.objects.all().delete()
        Requisition.objects.all().delete()
        AuditLog.objects.all().delete()

        # Routes are whatever Settings -> Routes already has; nothing is created here.
        today = timezone.localtime().date()

        if keep_fleet:
            # Reuse whatever's already there instead of wiping identities.
            drivers = list(Driver.objects.all())
            vehicles = list(Vehicle.objects.all())
        else:
            # Drivers and vehicles are paired 1:1, all ACTIVE -- an inactive driver
            # can't check in (TicketSerializer.create's driver.status guard), and a
            # vehicle with no driver can never queue, so neither would generate history.
            used_iwp, used_plates = set(), set()
            drivers, vehicles = [], []
            for _ in range(100):
                gender = random.choice(["MALE", "MALE", "FEMALE"])  # jeepney driving skews male, not exclusively
                first, middle, last = _rand_name(gender)
                city = random.choice(list(ADDRESSES))
                driver = Driver(
                    iwp_number=_rand_iwp(used_iwp),
                    iwp_expiration_date=_future_date(today, 60, 1000),
                    first_name=first,
                    middle_name=middle,
                    last_name=last,
                    gender=gender,
                    birthdate=date(random.randint(1968, 2001), random.randint(1, 12), random.randint(1, 28)),
                    province="La Union",
                    city=city,
                    barangay=random.choice(ADDRESSES[city]),
                    street=f"{random.randint(1, 200)} {random.choice(['Rizal', 'Bonifacio', 'Mabini', 'National Highway', 'Quezon'])} St.",
                    contact=_rand_contact(),
                    status="ACTIVE",
                )
                drivers.append(driver)
                vehicles.append(Vehicle(
                    plate_number=_rand_plate(used_plates),
                    transportation_id=jeepney,
                    franchise_number=f"{random.randint(18, 25)}-{random.randint(10000, 99999)}",
                    franchise_expiration_date=_future_date(today, 60, 1000),
                    route=random.choice(routes),
                    # Same string the Vehicle form builds from the chosen operator (buildDriverAddress).
                    operator_address=", ".join((driver.street, driver.barangay, driver.city, driver.province)),
                    status="AVAILABLE",
                ))

            if not dry_run:
                # Small volume (100) -- normal save() so each row queues into SyncQueue like real data.
                for d, v in zip(drivers, vehicles):
                    d.qr_code = d.iwp_number
                    d.save()
                    v.owner_driver = v.active_driver = d
                    v.qr_code = f"QR-{v.plate_number}-{uuid.uuid4().hex[:8].upper()}"
                    v.save()

        # Requisitions + series are created lazily as stock runs out (see
        # _draw_ticket_no); numbering starts at the registered booklet ranges.
        return {
            "before": before,
            "old_max_requisition_id": old_max_requisition_id,
            "next_requisition_id": old_max_requisition_id + 1,
            "requisitions": [],
            "series_count": 0,
            "admin_user": admin_user,
            # Per form: current series (None until first needed) + next unused ticket number.
            # Leading digit is the form price's own (1 for P10, 2 for P2), so the number
            # alone tells the denomination: 1020101001-1020102000, 2020101001-2020102000, ...
            "cursor": {f.id: {"series": None, "next": int(str(int(f.price))[0]) * 10**9 + 20_101_001} for f in ticket_forms},
            "ticket_forms": ticket_forms,
            "staff_users": staff_users,
            "vehicles": vehicles,
            "driver_count": len(drivers),
            "vehicle_count": len(vehicles),
            "keep_fleet": keep_fleet,
            "route_count": len(routes),
        }

    def _generate_history(self, ctx, months, daily_min, daily_max, cancelled_rate):
        # Every COLLECTED transaction must total exactly the configured terminal
        # price (see dispatch_ticket / roam check-in's price*quantity ==
        # terminal_price guard in views/viewsets.py) -- so a form only ever gets
        # issued in whatever fixed quantity hits that total exactly (e.g. a P2
        # ticket 5-at-a-time against a P10 terminal price), never as a lone P2.
        form_quantities = self._compute_form_quantities(ctx["ticket_forms"])
        available_vehicles = [v for v in ctx["vehicles"] if v.active_driver_id]
        ph_today = (timezone.now() + timedelta(hours=8)).date()
        start_day = ph_today - timedelta(days=months * 30)
        last_day = ph_today - timedelta(days=1)

        ticket_stats = {"created": 0, "days": 0}

        day = start_day
        while day <= last_day:
            with transaction.atomic():
                self._generate_day(day, daily_min, daily_max, cancelled_rate, form_quantities,
                                   available_vehicles, ctx, ticket_stats)
            day += timedelta(days=1)

        return ticket_stats

    def _draw_ticket_no(self, form, day, ctx):
        """Next physical ticket number for this form. Once the current 1000-ticket
        series is spent, a fresh requisition + contiguous series is issued (dated
        `day`, i.e. when the stock actually ran out). Returns (series, no)."""
        cur = ctx["cursor"][form.id]
        if cur["series"] is None or cur["next"] > int(cur["series"].end_no):
            cur["series"] = self._issue_series(form, cur["next"], day, ctx)
        no = cur["next"]
        cur["next"] += 1
        return cur["series"], no

    def _issue_series(self, form, start_no, day, ctx):
        admin_user = ctx["admin_user"]
        issued = _ph(day, 4)
        end_no = start_no + SERIES_SIZE - 1
        total = form.price * SERIES_SIZE
        req = Requisition.objects.create(
            id=ctx["next_requisition_id"],
            requested_by=admin_user,
            issued_by_name=f"{admin_user.first_name} {admin_user.last_name}".strip() or admin_user.username,
            status="ISSUED",
            total_value=total,
        )
        ctx["next_requisition_id"] += 1
        series = TicketSeries.objects.create(
            series_no=f"{start_no}-{end_no}",
            ticket_form=form,
            start_no=str(start_no),
            end_no=str(end_no),
            unit_value=form.price,
            total_value=total,
            requisition=req,
            issued_to=admin_user,
            date_issued=issued,
        )
        # auto_now(_add) stamps "now" on save; backdate to when the stock was requisitioned.
        Requisition.objects.filter(pk=req.pk).update(date_requested=issued, created_at=issued, updated_at=issued)
        TicketSeries.objects.filter(pk=series.pk).update(created_at=issued, updated_at=issued)
        ctx["requisitions"].append(req)
        ctx["series_count"] += 1
        return series

    def _generate_day(self, day, daily_min, daily_max, cancelled_rate, form_quantities,
                       available_vehicles, ctx, ticket_stats):
        ticket_forms, staff_users = ctx["ticket_forms"], ctx["staff_users"]
        # daily-min/daily-max count physical Ticket rows -- what the app itself
        # calls a "check-out" (EodReconciliation's checkout_count, in
        # views/reports.py, is literally len(COLLECTED tickets dispatched that
        # day)) -- not the higher-level transaction/issuance_group. A single P2
        # transaction still produces 5 of those rows, not 1, so the loop below
        # keeps adding transactions until their rows add up to the target,
        # rather than just counting transactions.
        target_rows = random.randint(daily_min, daily_max)

        # --- Pass 1: decide each transaction's shape (mode/timing/outcome/
        # form) before any ticket numbers are drawn.
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
            dispatched_at = _ph(day, hour, minute)

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

            if row_count + quantity > daily_max:
                break  # would blow the hard cap -- stop issuing for the day

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

        # --- Pass 2: materialize Ticket rows.
        day_tickets = []
        day_form_totals = {}  # form_id -> [amount_sum, min_no, max_no]

        for t in txns:
            vehicle, mode, on_duty = t["vehicle"], t["mode"], t["on_duty"]
            issued_at, status = t["issued_at"], t["status"]
            active_user_name = f"{on_duty.first_name} {on_duty.last_name}".strip() or on_duty.username
            issuance_group = uuid.uuid4().hex

            if status == "CANCELLED":
                # Cancelled before a ticket_form/quantity was ever chosen (that
                # only happens at dispatch/roam check-in), so no series number
                # is consumed -- a price-less placeholder.
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
                series, no = self._draw_ticket_no(form, day, ctx)
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
        # Marks the day's collected tickets as remitted, as saving a batch does for real,
        # and dates the batch to that evening instead of the moment this command ran.
        Ticket.objects.filter(pk__in=[t.id for t in day_tickets if t.status == "COLLECTED"]).update(remittance_batch=batch)
        RemittanceBatch.objects.filter(pk=batch.pk).update(issued_at=_ph(day, 20, 30))
        for form_id, (amount, min_no, _max_no) in day_form_totals.items():
            form = next(f for f in ticket_forms if f.id == form_id)
            # Like the real remittance form (createRemittance.jsx): From/To are the
            # peso value of this form's stock at the start of the day and what's left
            # after it (From - Amount), not ticket numbers. Today's draws are contiguous
            # up to the end of the current series, so start-of-day stock = end_no - min_no + 1.
            stock_from = form.price * (int(ctx["cursor"][form_id]["series"].end_no) - min_no + 1)
            Collection.objects.create(
                batch=batch,
                ticket_form_no=form.name,
                from_no=str(stock_from),
                to_no=str(stock_from - amount),
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
            f"{len(requisitions)} requisitions / {ctx['series_count']} ticket series (requisition ids from {old_max_requisition_id + 1}), "
            f"{ticket_stats['created']} tickets across {ticket_stats['days']} days."
        ))
