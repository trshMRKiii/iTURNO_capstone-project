"""Wipe transactional/fleet data and reseed North Central Terminal (San Fernando,
La Union) with a dummy fleet: 40 vehicles, 50 drivers, routes for real La Union
jeepney lines into the terminal, and ~4 months of backdated ticket history for
scale/stress testing.

Leaves User/Route(existing)/PUVType/TicketForm/TerminalPrice/WipMode untouched —
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

TOWNS = [
    "Bauang", "Agoo", "Aringay", "Caba", "Naguilian", "San Juan", "Bacnotan",
    "Luna", "Rosario", "Santo Tomas", "Tubao", "San Gabriel", "Balaoan",
    "Bagulin", "Sudipen", "Santol", "Pugo", "Burgos", "Bangar",
]

# Closer/busier towns get proportionally more vehicles on their route.
ROUTE_WEIGHTS = {
    "Bauang": 5, "Agoo": 4, "Naguilian": 4, "San Juan": 4, "Bacnotan": 4,
    "Aringay": 3, "Caba": 3, "Rosario": 3, "Santo Tomas": 2, "Luna": 2,
    "Tubao": 2, "San Gabriel": 1, "Balaoan": 2, "Bagulin": 1, "Sudipen": 1,
    "Santol": 1, "Pugo": 1, "Burgos": 1, "Bangar": 1,
}

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


def _rand_name(gender):
    first = random.choice(FIRST_NAMES_M if gender == "MALE" else FIRST_NAMES_F)
    middle = random.choice(LAST_NAMES)
    last = random.choice(LAST_NAMES)
    return first, middle, last


def _rand_plate(used):
    while True:
        plate = f"{''.join(random.choices('ABCDEFGHJKLMNPRSTUVWXYZ', k=3))} {random.randint(1000, 9999)}"
        if plate not in used:
            used.add(plate)
            return plate


def _rand_contact():
    return f"09{random.randint(100000000, 999999999)}"


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
        parser.add_argument("--months", type=int, default=4, help="How many months of ticket history to backdate.")
        parser.add_argument("--daily-avg", type=int, default=300, help="Approximate average weekday ticket count.")
        parser.add_argument("--seed", type=int, default=None, help="Random seed for reproducible runs.")

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        months = options["months"]
        daily_avg = options["daily_avg"]
        if options["seed"] is not None:
            random.seed(options["seed"])

        ticket_stats = {"created": 0, "days": 0}
        with transaction.atomic():
            ctx = self._setup(dry_run)
            if ctx is not None and not dry_run:
                ticket_stats = self._generate_history(ctx, months, daily_avg)
            if dry_run:
                transaction.set_rollback(True)

        if ctx is None:
            return

        self._report(dry_run, ctx, ticket_stats)

    def _setup(self, dry_run):
        """Wipe PUSH_MODELS and recreate routes/drivers/vehicles/requisitions/series.
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
        admin_user = User.objects.filter(role="SUPERADMIN").first() or User.objects.first()
        staff_users = list(User.objects.filter(role__in=["PERSONNEL", "SUPERVISOR", "MANAGER"])) or [admin_user]

        if not ticket_forms or not puv_types or not admin_user:
            self.stderr.write(self.style.ERROR(
                "Missing reference data (TicketForm/PUVType/User) -- run this after normal app setup, not on a bare DB."
            ))
            return None

        # Clear the outbox *before* wiping, not after: each delete below fires
        # api/sync/signals.py's post_delete hook, which queues a pending_delete
        # SyncQueue row so the same wipe eventually happens on the Supabase
        # mirror too. Clearing SyncQueue afterwards would discard exactly those
        # rows, leaving the old data stranded on Supabase forever instead of
        # actually being replaced.
        SyncQueue.objects.all().delete()

        # Cascades: Vehicle -> Ticket (CASCADE), Driver -> any leftover Ticket
        # (CASCADE), RemittanceBatch -> Deposit/Collection (CASCADE),
        # Requisition -> TicketSeries (CASCADE).
        Vehicle.objects.all().delete()
        Driver.objects.all().delete()
        RemittanceBatch.objects.all().delete()
        Requisition.objects.all().delete()
        AuditLog.objects.all().delete()

        # --- Routes -----------------------------------------------------
        routes_by_town = {}
        for town in TOWNS:
            route, _ = Route.objects.get_or_create(origin=town)
            routes_by_town[town] = route

        # --- Drivers (50) -------------------------------------------------
        drivers = []
        for i in range(1, 51):
            gender = random.choice(["MALE", "MALE", "FEMALE"])  # jeepney driving skews male, not exclusively
            first, middle, last = _rand_name(gender)
            town = random.choice(TOWNS)
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
                status="ACTIVE" if i > 3 else "INACTIVE",  # a few inactive for realism
            )
            drivers.append(driver)

        if not dry_run:
            for d in drivers:
                d.save()  # small volume (50) -- normal save() so it queues into SyncQueue like real data
                d.qr_code = d.iwp_number
                d.save(update_fields=["qr_code"])

        # --- Vehicles (40) --------------------------------------------------
        weighted_towns = [t for t, w in ROUTE_WEIGHTS.items() for _ in range(w)]
        used_plates = set()
        vehicles = []
        # Only ACTIVE drivers get assigned as a vehicle's active_driver -- an
        # inactive one can't legally check in (see TicketSerializer.create's
        # driver.status != 'ACTIVE' guard), so pairing one with a vehicle would
        # leave that vehicle unable to ever queue.
        assignable_drivers = [d for d in drivers if d.status == "ACTIVE"]
        for i in range(40):
            town = random.choice(weighted_towns)
            puv = puv_types[0] if random.random() < 0.85 and any(p.name == "Jeepney" for p in puv_types) else random.choice(puv_types)
            driver = assignable_drivers[i] if i < len(assignable_drivers) else None
            vehicle = Vehicle(
                plate_number=_rand_plate(used_plates),
                transportation_id=puv,
                franchise_number=f"{random.randint(2018, 2025)}-LTFRB-{random.randint(10000, 99999)}",
                route=routes_by_town[town],
                operator_address=f"{random.choice(BARANGAYS)}, {town}, La Union",
                status="AVAILABLE",
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
            next_ticket_no = 1
            for i, (req, form) in enumerate(zip(requisitions, ticket_forms)):
                for s in range(2):  # 2 series per form, generous ranges so history never runs out
                    start_no = next_ticket_no
                    end_no = start_no + 19999
                    next_ticket_no = end_no + 1
                    series = TicketSeries(
                        series_no=f"{form.name[:12].upper().replace(' ', '')}-{i}-{s}",
                        ticket_form=form,
                        pad_no=f"PAD-{i}{s}",
                        box_no=f"BOX-{i}{s}",
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
            "series_list": series_list,
        }

    def _generate_history(self, ctx, months, daily_avg):
        ticket_forms = ctx["ticket_forms"]
        staff_users = ctx["staff_users"]
        series_list = ctx["series_list"]

        series_cursor = {s.id: int(s.start_no) for s in series_list}
        series_by_form = {}
        for s in series_list:
            series_by_form.setdefault(s.ticket_form_id, []).append(s)

        available_vehicles = [v for v in ctx["vehicles"] if v.active_driver_id]
        today = timezone.localtime().date()
        start_day = today - timedelta(days=months * 30)

        ticket_stats = {"created": 0, "days": 0}

        day = start_day
        while day <= today:
            with transaction.atomic():
                self._generate_day(
                    day, today, daily_avg, available_vehicles, ticket_forms, staff_users,
                    series_cursor, series_by_form, ticket_stats,
                )
            day += timedelta(days=1)

        return ticket_stats

    def _generate_day(self, day, today, daily_avg, available_vehicles, ticket_forms, staff_users,
                       series_cursor, series_by_form, ticket_stats):
        is_weekend = day.weekday() >= 5
        base = daily_avg * (0.5 if is_weekend else 1.0)
        day_count = max(1, int(random.gauss(base, base * 0.15)))

        day_tickets = []
        day_form_totals = {}  # form_id -> [amount_sum, min_no, max_no]

        for _ in range(day_count):
            vehicle = random.choice(available_vehicles)
            form = random.choice(ticket_forms)
            form_series = series_by_form.get(form.id)
            if not form_series:
                continue
            series = form_series[0]
            no = series_cursor[series.id]
            if no > int(series.end_no):
                # exhausted -- fall over to the next series for this form
                if len(form_series) > 1:
                    series_by_form[form.id] = form_series[1:]
                continue
            series_cursor[series.id] = no + 1

            hour = random.choices(
                range(5, 20),
                weights=[3, 5, 8, 8, 5, 4, 4, 4, 4, 4, 5, 6, 8, 6, 3],
            )[0]
            minute = random.randint(0, 59)
            dispatched_at = timezone.make_aware(datetime.combine(day, time(hour, minute)))
            issued_at = dispatched_at - timedelta(minutes=random.randint(1, 8))

            mode = "UNLOAD" if random.random() < 0.1 else "QUEUE"
            on_duty = random.choice(staff_users)
            ticket = Ticket(
                id=str(no),
                vehicle=vehicle,
                driver_id=vehicle.active_driver_id,
                active_user=on_duty,
                active_user_name=f"{on_duty.first_name} {on_duty.last_name}".strip() or on_duty.username,
                route=vehicle.route,
                mode=mode,
                series=series,
                status="COLLECTED",
                collection_amount=form.price,
                is_verified=True,
                issued_at=issued_at,
                dispatched_at=dispatched_at,
                issuance_group=uuid.uuid4().hex,
            )
            ticket._issued_at_fix = issued_at
            ticket._created_at_fix = issued_at
            day_tickets.append(ticket)

            totals = day_form_totals.setdefault(form.id, [Decimal("0"), no, no])
            totals[0] += form.price
            totals[1] = min(totals[1], no)
            totals[2] = max(totals[2], no)

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
            status="OPEN" if day == today else "CLOSED",
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
        self.stdout.write(self.style.SUCCESS(
            f"{'[DRY RUN] ' if dry_run else ''}"
            f"Wiped: {before['vehicles']} vehicles, {before['drivers']} drivers, {before['tickets']} tickets, "
            f"{before['requisitions']} requisitions, {before['remittance_batches']} remittance batches.\n"
            f"Reseeded: {len(TOWNS)} routes, 50 drivers, 40 vehicles, "
            f"{len(requisitions)} requisitions (ids {old_max_requisition_id + 1}-{old_max_requisition_id + len(requisitions)}), "
            f"{ticket_stats['created']} tickets across {ticket_stats['days']} days."
        ))
