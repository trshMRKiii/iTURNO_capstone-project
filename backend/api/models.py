from django.contrib.auth.base_user import BaseUserManager
from django.contrib.auth.models import AbstractUser
from django.core.validators import EmailValidator
from django.db import models
from django.utils import timezone


LOCAL_ADMIN_PK_BASE = 1_000_000


# Create your models here.

class UserManager(BaseUserManager):
    """Username-only manager — the default UserManager always passes `email`
    to the model constructor, which breaks since User has no email field
    (username doubles as the email address)."""
    use_in_migrations = True

    def _create_user(self, username, password, **extra_fields):
        if not username:
            raise ValueError('The username (email) must be set')
        user = self.model(username=self.normalize_email(username), **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, username=None, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', False)
        extra_fields.setdefault('is_superuser', False)
        return self._create_user(username, password, **extra_fields)

    def create_superuser(self, username=None, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)

        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')

        if self._db in (None, 'default'):
            # Local-only emergency admin (works offline): park its id far above
            # Supabase's sequence so a pulled row can never overwrite it.
            extra_fields.setdefault('pk', max(self.model.objects.aggregate(m=models.Max('pk'))['m'] or 0, LOCAL_ADMIN_PK_BASE) + 1)
        return self._create_user(username, password, **extra_fields)


class User(AbstractUser):
    email = None
    REQUIRED_FIELDS = []
    username = models.CharField(
        max_length=254,
        unique=True,
        validators=[EmailValidator(message='Enter a valid email address.')],
        error_messages={'unique': 'A user with that email already exists.'},
        help_text='Used as the account email address and login.',
        verbose_name='email address',
    )
    
    objects = UserManager()

    ROLE_CHOICES = [('PERSONNEL', 'Personnel'), ('SUPERVISOR', 'Supervisor'), ('MANAGER', 'Manager'), ('SUPERADMIN', 'Admin')]
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='PERSONNEL')
    middle_name = models.CharField(max_length=100, blank=True, default='')
    contact = models.CharField(max_length=20, blank=True, default='')
    # Ticked by a Supervisor/Manager (or Admin) to let a PERSONNEL account register
    # vehicles and drivers. Ignored for the other roles, who always can.
    can_manage_fleet = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)
    must_reset_password = models.BooleanField(default=False)
    # default=True so existing/self-created accounts are unaffected — only
    # UserSerializer.create() (admin-added staff accounts) sets this False,
    # gating login until the verification email link is clicked. See
    # views/viewsets.py's _send_verification_email / views/auth.py's verify_email.
    email_verified = models.BooleanField(default=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['role', 'is_active'])]

class Driver(models.Model):
    STATUS_CHOICES = [('ACTIVE', 'Active'), ('INACTIVE', 'Inactive')]
    GENDER_CHOICES = [('MALE', 'Male'), ('FEMALE', 'Female'), ('OTHER', 'Other')]

    id = models.AutoField(primary_key=True)
    iwp_number = models.CharField(max_length=50, blank=True, db_index=True)
    iwp_expiration_date = models.DateField(null=True, blank=True)

    first_name = models.CharField(max_length=100, db_index=True)
    middle_name = models.CharField(max_length=100, blank=True, db_index=True)
    last_name = models.CharField(max_length=100, db_index=True)
    gender = models.CharField(max_length=10, choices=GENDER_CHOICES, blank=True)
    birthdate = models.DateField(null=True, blank=True)
    province = models.CharField(max_length=100, default='La Union')
    city = models.CharField(max_length=100, blank=True)
    barangay = models.CharField(max_length=100, blank=True)
    street = models.CharField(max_length=255, blank=True)
    photo = models.ImageField(upload_to='driver_photos/', blank=True, null=True)
    contact = models.CharField(max_length=20)
    qr_code = models.CharField(max_length=255, blank=True, db_index=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ACTIVE')
    is_archived = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [models.Index(fields=['status', 'is_archived'])]

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)

    @property
    def iwp_expired(self):
        # Valid through the expiry day itself; no date on file is not treated as expired.
        return bool(self.iwp_expiration_date and self.iwp_expiration_date < timezone.localdate())

    def __str__(self):
        return f"{self.last_name}, {self.first_name}".strip()


class Route(models.Model):

    DESTINATION = "San Fernando"

    origin = models.CharField(max_length=100, unique=True, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    # Retired from dropdowns/settings but kept so vehicles and ticket history
    # still resolve to it. In-use routes can't be deleted — only archived.
    is_archived = models.BooleanField(default=False, db_index=True)
    # Manually configured turnaround estimate (minutes) used to project the next
    # departure time once a vehicle reaches the front of this route's queue.
    # Null falls back to a global default — see DEFAULT_ESTIMATED_LOADING_MINUTES
    # in views/records.py.
    estimated_loading_minutes = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['origin']

    @property
    def full_name(self):
        return self.origin

    @property
    def acronym(self):
        """Route prefix used in ticket/queue codes, e.g. 'BAC-1'.

        Multi-word origins use one initial per word (up to 3), e.g.
        'Luna via Balaoan' -> 'LVB'. Single-word origins start at 3 letters
        and grow one letter at a time only if that would clash with
        another route's first word, e.g. 'Bacnotan' -> 'BAC' and
        'Bauang' -> 'BAU' instead of both being 'BA'.
        """
        words = [w for w in self.origin.split() if w]
        if not words:
            return "RT"
        if len(words) >= 2:
            return "".join(w[0] for w in words[:3]).upper()

        word = words[0].upper()
        other_first_words = [
            other.split()[0].upper()
            for other in Route.objects.exclude(pk=self.pk).values_list('origin', flat=True)
            if other.strip()
        ]
        for length in range(3, len(word) + 1):
            candidate = word[:length]
            if not any(other[:length] == candidate for other in other_first_words):
                return candidate
        return word

    def __str__(self):
        return self.full_name


class Vehicle(models.Model):
    STATUS_CHOICES = [
        ('AVAILABLE', 'Available'),
        ('QUEUED', 'Queued'),
    ]

    id = models.AutoField(primary_key=True)
    plate_number = models.CharField(unique=True, max_length=20, db_index=True)
    transportation_id = models.ForeignKey('PUVType', null=True, blank=True, on_delete=models.SET_NULL, related_name='vehicles', db_index=True)
    franchise_number = models.CharField(max_length=100, blank=True, db_index=True)
    franchise_expiration_date = models.DateField(null=True, blank=True)
    route =models.ForeignKey('Route', null=True, blank=True, on_delete=models.SET_NULL, related_name='vehicles', db_index=True)

    operator_address = models.CharField(max_length=255, blank=True)
    qr_code = models.CharField(max_length=255, blank=True, db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='AVAILABLE')
    # The vehicle's registered driver — set only via the Vehicle Registry
    # records form, stable across shifts.
    owner_driver = models.ForeignKey('Driver', null=True, blank=True, on_delete=models.SET_NULL, related_name='owned_vehicles')
    # Who's actually driving right now — set by check-in/roam/dispatch, and
    # reverted to owner_driver when a stale queue ticket expires at day's end
    # (see expire_stale_queue_tickets in views/helpers.py).
    active_driver = models.ForeignKey('Driver', null=True, blank=True, on_delete=models.SET_NULL, related_name='vehicles')

    is_archived = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['status', 'is_archived'], name='api_vehicle_status_9de6a2_idx'),
            models.Index(fields=['route', 'is_archived'], name='api_vehicle_route_i_33d88b_idx'),
        ]

    @property
    def franchise_expired(self):
        return bool(self.franchise_expiration_date and self.franchise_expiration_date < timezone.localdate())

    def __str__(self):
        return self.plate_number

class Ticket(models.Model):
    STATUS_CHOICES = [('QUEUED', 'Queued'), ('COLLECTED', 'Collected'), ('CANCELLED', 'Cancelled')]
    MODE_CHOICES = [('UNLOAD', 'Unload'), ('QUEUE', 'Queue')]

    id = models.CharField(max_length=50, primary_key=True)

    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name='tickets')
    driver = models.ForeignKey(Driver, on_delete=models.CASCADE, related_name='tickets')
    active_user = models.ForeignKey(User, on_delete=models.SET_NULL, related_name='tickets', null=True, blank=True)
    active_user_name = models.CharField(max_length=150, blank=True, default="")

    route = models.ForeignKey(Route, on_delete=models.SET_NULL, related_name='tickets', null=True, blank=True, db_index=True)
    mode = models.CharField(max_length=20, choices=MODE_CHOICES, default='QUEUE')
    series = models.ForeignKey('TicketSeries', on_delete=models.SET_NULL, related_name='tickets', null=True, blank=True)
    remittance_batch = models.ForeignKey('RemittanceBatch', on_delete=models.SET_NULL, related_name='tickets', null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='QUEUED')
    collection_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True)
    is_verified = models.BooleanField(default=False, db_index=True)
    issued_at = models.DateTimeField(auto_now_add=True, db_index=True)
    # Set once this ticket's vehicle becomes first-in-line for its route (i.e.
    # reaches the loading zone) — see promote_queue_front() in views/helpers.py.
    # Carried over to the dispatched ticket so dispatched_at - loading_started_at
    # gives the actual loading duration for that trip, without needing a
    # separate duration column or table.
    loading_started_at = models.DateTimeField(null=True, blank=True, db_index=True)
    # One-off addition to the route's estimated_loading_minutes, for this ticket
    # only (e.g. a peak-hour extension) — never touches the route default and
    # never affects the real dispatched_at - loading_started_at duration used
    # for stats, since it only shifts the displayed/estimated deadline.
    extra_loading_minutes = models.PositiveIntegerField(default=0)
    # Manual drag-and-drop override of this vehicle's spot in its route's queue.
    # Null until the queue is reordered at least once; ties/fallback use
    # issued_at (plain FIFO) — see promote_queue_front() and the Ticket
    # reorder-queue action.
    queue_rank = models.IntegerField(null=True, blank=True, db_index=True)
    dispatched_at = models.DateTimeField(null=True, blank=True)

    issuance_group = models.CharField(max_length=40, blank=True, db_index=True)
    queue_code = models.CharField(max_length=20, blank=True, db_index=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['status', 'is_verified']),
            models.Index(fields=['issued_at', 'status']),
        ]

    @property
    def route_name(self):
        if self.route:
            return self.route.full_name if hasattr(self.route, 'full_name') else str(self.route)
        return ''

    def save(self, *args, **kwargs):
        if self.collection_amount is None:
            latest_price = TicketPrice.objects.order_by('-effective_date').first()
            if latest_price:
                self.collection_amount = latest_price.amount
            # If no price exists, leave as null — backend will use fallback
        # Snapshot the issuing user's name so "who issued this" survives even
        # if the account is later deleted (active_user is SET_NULL) — captured
        # once, on first save, so it reflects who actually issued it.
        if self.active_user_id and not self.active_user_name:
            user = self.active_user
            self.active_user_name = f"{user.first_name} {user.last_name}".strip() or user.username
        super().save(*args, **kwargs)

    def __str__(self):
        if self.queue_code:
            return f"Ticket {self.queue_code}"
        plate = self.vehicle.plate_number if self.vehicle_id else "?"
        return f"Roaming ticket ({plate})"

class Requisition(models.Model):
    STATUS_CHOICES = [('PENDING', 'Pending'), ('APPROVED', 'Approved'), ('ISSUED', 'Issued')]

    date_requested = models.DateTimeField(auto_now_add=True)
    requested_by = models.ForeignKey(User, on_delete=models.SET_NULL, related_name='requisitions_requested', null=True, blank=True)
    requested_by_name = models.CharField(max_length=150, blank=True, default="")
    # Whoever keyed the requisition into the system (requested_by is the supervisor who asked for it).
    issued_by_name = models.CharField(max_length=150, blank=True, default="")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    total_value = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_archived = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        # Same reasoning as Ticket.active_user_name — requested_by is SET_NULL,
        # so capture the name once up front rather than losing it later.
        if self.requested_by_id and not self.requested_by_name:
            user = self.requested_by
            self.requested_by_name = f"{user.first_name} {user.last_name}".strip() or user.username
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Requisition #{self.pk} - {self.status}"


class TicketSeries(models.Model):
    series_no = models.CharField(max_length=50, unique=True, db_index=True)
    ticket_form = models.ForeignKey('TicketForm', on_delete=models.SET_NULL, null=True, blank=True)

    start_no = models.CharField(max_length=20)
    end_no = models.CharField(max_length=20)
    unit_value = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_value = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    requisition = models.ForeignKey(Requisition, on_delete=models.CASCADE, related_name='ticket_series')
    issued_to = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='issued_ticket_series')
    date_issued = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = 'Ticket series'

    def __str__(self):
        return f"Series {self.series_no} ({self.start_no}–{self.end_no})"


class PaperIssuance(models.Model):
    """A range of physical ticket numbers handed out outside the system (downtime,
    or remitted without it). The numbers are reserved so the allocator skips them,
    and counted toward stock and that day's expected cash. The amount is derived
    (count x the ticket form's price) so it can't drift from the price list."""
    REASON_CHOICES = [('SYSTEM_DOWN', 'System down'), ('REMITTED_WITHOUT_SYSTEM', 'Remitted without system'), ('OTHER', 'Other')]

    series = models.ForeignKey(TicketSeries, on_delete=models.CASCADE, related_name='paper_issuances')
    from_no = models.PositiveIntegerField()
    to_no = models.PositiveIntegerField()
    used_on = models.DateField(db_index=True)
    reason = models.CharField(max_length=30, choices=REASON_CHOICES, default='SYSTEM_DOWN')
    note = models.CharField(max_length=255, blank=True, default="")
    recorded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='paper_issuances')
    recorded_by_name = models.CharField(max_length=150, blank=True, default="")
    remittance_batch = models.ForeignKey('RemittanceBatch', on_delete=models.SET_NULL, null=True, blank=True, related_name='paper_issuances')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-used_on', '-id']

    @property
    def count(self):
        return self.to_no - self.from_no + 1

    @property
    def amount(self):
        form = self.series.ticket_form
        return self.count * (form.price if form else self.series.unit_value)

    def __str__(self):
        return f"Paper {self.from_no}–{self.to_no} (series {self.series_id})"


class TicketPrice(models.Model):
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    effective_date = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-effective_date']

    def __str__(self):
        return f"{self.amount} (effective {self.effective_date})"
    
class PUVType(models.Model):
    name = models.CharField(max_length=50, unique=True)
    # Exact total (ticket price x quantity) a vehicle of this type must be charged
    # per ticket issuance; 0 disables the check for the type.
    terminal_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    # See Route.is_archived — in-use types can only be archived, never deleted.
    is_archived = models.BooleanField(default=False, db_index=True)

    def __str__(self):
        return self.name

class TicketForm(models.Model):
    name = models.CharField(max_length=100, unique=True)
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    def __str__(self):
        return self.name

class WipMode(models.Model):
    """Singleton operational flag: while active, new ticket issuance is hard-blocked
    system-wide (see TicketViewSet.perform_create / dispatch_ticket). The LAN-side
    block always reads this straight from 'default' with zero latency — that part
    never goes through Supabase. It's in PUSH_MODELS purely so the remote dashboard
    can *display* whether WIP is on (e.g. to gate remote backfill submission),
    which can tolerate ordinary push latency same as any other pushed record."""
    is_active = models.BooleanField(default=False)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"WIP Mode: {'ACTIVE' if self.is_active else 'inactive'}"

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class RemoteBackfillRequest(models.Model):
    """A backfill row submitted from the remote (Vercel) dashboard while WipMode
    is active. Ticket is push-only (sync/registry.py) — LAN is always
    authoritative for what tickets exist — so a remote submission can't create a
    Ticket directly. It lands here instead (written straight to Supabase by the
    remote endpoint), and api/sync/apply_remote_backfill.py applies it through
    the same _resolve_batch/_reserve_and_create path as a local manual entry on the next
    sync cycle, then writes the outcome back onto this same row for the remote
    UI to poll."""
    STATUS_CHOICES = [('PENDING', 'Pending'), ('APPLIED', 'Applied'), ('FAILED', 'Failed')]

    # Raw payload, keyed by the same plain-English field names
    # (F_PLATE etc. in backend/api/views/backfill.py and
    # src/app/dashboard/settings/backfill/fields.js) that _resolve_batch expects
    # — avoids duplicating every backfill column onto this model too.
    payload = models.JSONField()
    ticket_id = models.CharField(max_length=50, blank=True, default="")  # denormalized for quick display
    requested_by_name = models.CharField(max_length=150, blank=True, default="")

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="PENDING")
    result_reason = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    applied_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"RemoteBackfillRequest({self.ticket_id or self.pk}, {self.status})"


class RemittanceBatch(models.Model):
    batch_code = models.CharField(max_length=20, unique=True, blank=True, null=True)
    issued_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    issued_at = models.DateTimeField(auto_now_add=True)
    covers_date = models.DateField(null=True, blank=True)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_archived = models.BooleanField(default=False, db_index=True)

class Deposit(models.Model):
    batch = models.ForeignKey(RemittanceBatch, related_name="deposits", on_delete=models.CASCADE)
    type = models.CharField(max_length=10, choices=[("bill","Bill"),("coin","Coin")])
    denomination = models.IntegerField(default=0)
    quantity = models.IntegerField(default=0)
    deposit_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

class Collection(models.Model):
    batch = models.ForeignKey(RemittanceBatch, related_name="collections", on_delete=models.CASCADE)
    ticket_form_no = models.CharField(max_length=50, blank=True, null=True)
    from_no = models.CharField(max_length=20, blank=True, null=True)
    to_no = models.CharField(max_length=20, blank=True, null=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

class AuditLog(models.Model):
    ACTION_CHOICES = [('CREATE', 'Create'), ('UPDATE', 'Update'), ('DELETE', 'Delete')]

    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='audit_logs')
    action = models.CharField(max_length=10, choices=ACTION_CHOICES)
    model_name = models.CharField(max_length=100)
    object_id = models.CharField(max_length=50, blank=True)
    object_repr = models.CharField(max_length=255, blank=True)
    changes = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['model_name', 'action']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f"{self.get_action_display()} {self.model_name} #{self.object_id} by {self.user or 'System'}"


class BackupRecord(models.Model):
    SOURCE_CHOICES = [('MANUAL', 'Manual'), ('AUTO', 'Automatic (pre-restore)')]

    filename = models.CharField(max_length=255)
    label = models.CharField(max_length=255, blank=True)
    source = models.CharField(max_length=10, choices=SOURCE_CHOICES, default='MANUAL')
    size_bytes = models.PositiveIntegerField(default=0)
    created_by = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, blank=True, related_name='backups')
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.filename} ({self.created_at})"


class BackupSettings(models.Model):
    """Singleton: how often the scheduled backup runs and how long automatic backups
    are kept. Like BackupRecord it is left out of backups and restores, so rolling
    back never reverts these choices. Defaults mirror the AUTO_BACKUP_* settings."""
    enabled = models.BooleanField(default=True)
    interval_days = models.PositiveIntegerField(default=1)
    keep_days = models.PositiveIntegerField(default=28)

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class BackfillRecord(models.Model):
    """One row per committed paper-ticket backfill (manual, CSV, or applied from a
    remote request) — powers the history table on the Ticket Backfill settings tab
    so staff can see who backfilled what and when, and re-download the exact CSV
    that was imported. created_by_name mirrors Ticket.active_user_name: stored as
    plain text at creation time so display never depends on the User FK still
    resolving (a remote submitter may not have a matching LAN account)."""
    created_by = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, blank=True, related_name='backfill_records')
    created_by_name = models.CharField(max_length=150, blank=True, default="")
    ticket_count = models.PositiveIntegerField(default=0)
    reason = models.TextField()
    # Null for CSV imports: each row carries its own Date and Time Issued (the paper
    # log books this data comes from are kept per-route with their own real
    # timestamps, so one shared value for the whole file would be less accurate than
    # what's already on each row) — only Manual/Remote entries have one true value.
    issued_at = models.DateTimeField(null=True, blank=True)
    csv_filename = models.CharField(max_length=255, blank=True, default="")
    csv_file = models.FileField(upload_to='backfill_csv/', null=True, blank=True)
    # Every ticket this entry added: [{ticket_id, time, vehicle, driver, route, amount}].
    entries = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Backfill ({self.ticket_count} ticket(s)) by {self.created_by_name or 'System'}"


class PendingFleetAccess(models.Model):
    """A fleet-access tick made on the LAN that Supabase hasn't received yet.

    User is Supabase-authoritative (pulled, never pushed), so a plain local edit
    would be overwritten by the next pull. Supervisors tick this on site, often
    offline: the tick is saved locally at once, parked here, and pushed as a
    single-field update (api/sync/fleet_access.py) — never a whole-row push, which
    could clobber the remote password. pull_all() re-applies it over the pulled copy
    until it lands."""
    user_id = models.IntegerField(unique=True)
    can_manage_fleet = models.BooleanField()
    queued_at = models.DateTimeField(auto_now=True)


class PendingSetting(models.Model):
    """A Route / PUV type / ticket form / ticket price saved on the LAN that Supabase
    hasn't received yet.

    These are Supabase-authoritative (pulled), so an offline create/edit would be wiped
    by the next pull. It is saved locally at once and parked here; api/sync/settings_outbox.py
    pushes the whole row when Supabase is back, and pull_all() leaves parked rows alone
    until then. Rows created offline get an id above LOCAL_ADMIN_PK_BASE so they can be
    pushed under the same id with no FK remapping. An offline delete parks a tombstone
    (is_delete) instead: the row is gone locally, and the flush deletes it on Supabase."""
    model_label = models.CharField(max_length=60)
    obj_id = models.IntegerField()
    is_delete = models.BooleanField(default=False)
    queued_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('model_label', 'obj_id')


class PendingAccountEmail(models.Model):
    """A new staff account's login email that hasn't gone out yet (no internet, or
    the account hasn't reached Supabase yet).

    The temp password exists nowhere else — only its hash is stored on the user — so
    it is parked here until api/sync/account_emails.py sends it, then the row is
    deleted. The account still has must_reset_password, so it can't outlive first login."""
    user_id = models.IntegerField(unique=True)
    temp_password = models.CharField(max_length=64)
    queued_at = models.DateTimeField(auto_now=True)


class SyncQueue(models.Model):
    """Outbox of LAN-owned rows pending push to the Supabase mirror.

    A row is (re-)queued by api/sync/signals.py on every save (or delete —
    see pending_delete) of a model in api/sync/registry.py's PUSH_MODELS.
    api/sync/push.py drains rows where synced_at is null; nothing is ever
    dropped from here on failure — it's just retried again next cycle, so a
    bad network blip only delays the remote mirror, never loses data (the
    SQLite row is the real source of truth regardless of sync status).
    """
    model_label = models.CharField(max_length=100, db_index=True)
    object_id = models.CharField(max_length=50)
    queued_at = models.DateTimeField(auto_now_add=True)
    synced_at = models.DateTimeField(null=True, blank=True, db_index=True)
    attempts = models.PositiveIntegerField(default=0)
    last_error = models.TextField(blank=True)
    pending_delete = models.BooleanField(default=False)

    class Meta:
        ordering = ['queued_at']
        constraints = [
            models.UniqueConstraint(fields=['model_label', 'object_id'], name='unique_sync_queue_object')
        ]

    def __str__(self):
        if self.synced_at:
            state = 'synced'
        elif self.pending_delete:
            state = f'pending delete ({self.attempts} attempts)'
        else:
            state = f'pending ({self.attempts} attempts)'
        return f"{self.model_label}#{self.object_id} - {state}"
