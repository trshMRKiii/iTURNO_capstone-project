from django.contrib.auth.models import AbstractUser
from django.core.validators import EmailValidator
from django.db import models

# Create your models here.
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

    ROLE_CHOICES = [('PERSONNEL', 'Personnel'), ('SUPERVISOR', 'Supervisor'), ('MANAGER', 'Manager'), ('SUPERADMIN', 'Admin')]
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='PERSONNEL')
    middle_name = models.CharField(max_length=100, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)
    must_reset_password = models.BooleanField(default=False)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['role', 'is_active'])]

class Driver(models.Model):
    STATUS_CHOICES = [('ACTIVE', 'Active'), ('INACTIVE', 'Inactive')]
    GENDER_CHOICES = [('MALE', 'Male'), ('FEMALE', 'Female'), ('OTHER', 'Other')]

    id = models.AutoField(primary_key=True)
    iwp_number = models.CharField(max_length=50, blank=True, db_index=True)

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


    def __str__(self):
        return f"{self.last_name}, {self.first_name}".strip()


class Route(models.Model):

    DESTINATION = "San Fernando"

    origin = models.CharField(max_length=100, unique=True, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['origin']

    @property
    def full_name(self):
        return f"{self.origin} - {self.DESTINATION}"

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
    route = models.ForeignKey('Route', null=True, blank=True, on_delete=models.SET_NULL, related_name='vehicles', db_index=True)

    operator_address = models.CharField(max_length=255, blank=True)
    qr_code = models.CharField(max_length=255, blank=True, db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='AVAILABLE')
    active_driver = models.ForeignKey('Driver', null=True, blank=True, on_delete=models.SET_NULL, related_name='vehicles')

    is_archived = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=['status', 'is_archived'], name='api_vehicle_status_9de6a2_idx'),
            models.Index(fields=['route', 'is_archived'], name='api_vehicle_route_i_33d88b_idx'),
        ]

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
    dispatched_at = models.DateTimeField(null=True, blank=True)
    nullified_at = models.DateTimeField(null=True, blank=True)
    reason = models.TextField(blank=True)

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
    approved_by_name = models.CharField(max_length=150, blank=True, default="")
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

    pad_no = models.CharField(max_length=50, blank=True)
    box_no = models.CharField(max_length=50, blank=True)

    start_no = models.CharField(max_length=20)
    end_no = models.CharField(max_length=20)
    unit_value = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    total_value = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    requisition = models.ForeignKey(Requisition, on_delete=models.CASCADE, related_name='ticket_series')
    issued_to = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='issued_ticket_series')
    date_issued = models.DateTimeField(null=True, blank=True)
    beginning_balance = models.PositiveIntegerField(null=True, blank=True)
    beginning_balance_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = 'Ticket series'

    def __str__(self):
        return f"Series {self.series_no} ({self.start_no}–{self.end_no})"


class TicketPrice(models.Model):
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    effective_date = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-effective_date']

    def __str__(self):
        return f"{self.amount} (effective {self.effective_date})"
    
class PUVType(models.Model):
    name = models.CharField(max_length=50, unique=True)

    def __str__(self):
        return self.name

class TicketForm(models.Model):
    name = models.CharField(max_length=100, unique=True)
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    def __str__(self):
        return self.name

class TerminalPrice(models.Model):
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Terminal Price: ₱{self.amount}"

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


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
    the same _resolve_row/_create_ticket path as a local manual entry on the next
    sync cycle, then writes the outcome back onto this same row for the remote
    UI to poll."""
    STATUS_CHOICES = [('PENDING', 'Pending'), ('APPLIED', 'Applied'), ('FAILED', 'Failed')]

    # Raw payload, keyed by the same plain-English field names
    # (F_TICKET_ID etc. in backend/api/views/backfill.py and
    # src/app/dashboard/settings/backfill/fields.js) that _resolve_row expects
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
    status = models.CharField(max_length=20, default="OPEN")
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


class RoamingLog(models.Model):
    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name='roaming_logs')
    driver = models.ForeignKey(Driver, on_delete=models.SET_NULL, null=True, blank=True, related_name='roaming_logs')
    recorded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='roaming_logs')
    notes = models.TextField(blank=True)
    recorded_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-recorded_at']

    def __str__(self):
        return f"{self.vehicle} - Roaming at {self.recorded_at}"
