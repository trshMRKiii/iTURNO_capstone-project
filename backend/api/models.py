from django.contrib.auth.models import AbstractUser
from django.db import models

# Create your models here.
class User(AbstractUser):
    ROLE_CHOICES = [('PERSONNEL', 'Personnel'), ('SUPERVISOR', 'Supervisor'), ('MANAGER', 'Manager'), ('ADMIN', 'Admin')]
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='PERSONNEL')
    middle_name = models.CharField(max_length=100, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['role', 'is_active'])]

class Driver(models.Model):
    STATUS_CHOICES = [('ACTIVE', 'Active'), ('INACTIVE', 'Inactive')]
    GENDER_CHOICES = [('MALE', 'Male'), ('FEMALE', 'Female'), ('OTHER', 'Other')]

    id = models.AutoField(primary_key=True)
    iwp_number = models.CharField(max_length=50, blank=True, db_index=True)

    first_name = models.CharField(max_length=100, db_index=True)
    middle_name = models.CharField(max_length=100, db_index=True)
    last_name = models.CharField(max_length=100, db_index=True)
    gender = models.CharField(max_length=10, choices=GENDER_CHOICES, blank=True)
    birthdate = models.DateField(null=True, blank=True)
    province = models.CharField(max_length=100, default='La Union')
    city = models.CharField(max_length=100, blank=True)
    barangay = models.CharField(max_length=100, blank=True)
    street = models.CharField(max_length=255, blank=True)
    photo = models.ImageField(upload_to='driver_photos/', blank=True, null=True)
    contact = models.CharField(max_length=20)

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

    def __str__(self):
        return self.full_name


class Vehicle(models.Model):
    STATUS_CHOICES = [
        ('AVAILABLE', 'Available'),
        ('DISPATCHED', 'Dispatched'),
        ('MAINTENANCE', 'Maintenance'),
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
            models.Index(fields=['status', 'is_archived']),
            models.Index(fields=['route', 'is_archived']),
        ]

class Ticket(models.Model):
    STATUS_CHOICES = [('ISSUED', 'Issued'), ('DISPATCHED', 'Dispatched'), ('COLLECTED', 'Collected'), ('CANCELLED', 'Cancelled'), ('RETURNED', 'Returned')]
    MODE_CHOICES = [('UNLOAD', 'Unload'), ('QUEUE', 'Queue')]

    id = models.CharField(max_length=50, primary_key=True)

    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name='tickets')
    driver = models.ForeignKey(Driver, on_delete=models.CASCADE, related_name='tickets')
    active_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='tickets', null=True, blank=True)

    route = models.ForeignKey(Route, on_delete=models.SET_NULL, related_name='tickets', null=True, blank=True, db_index=True)
    mode = models.CharField(max_length=20, choices=MODE_CHOICES, default='QUEUE')
    series = models.ForeignKey('TicketSeries', on_delete=models.SET_NULL, related_name='tickets', null=True, blank=True)
    remittance_batch = models.ForeignKey('RemittanceBatch', on_delete=models.SET_NULL, related_name='tickets', null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='ISSUED')
    collection_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True)
    is_verified = models.BooleanField(default=False, db_index=True)
    issued_at = models.DateTimeField(auto_now_add=True, db_index=True)
    dispatched_at = models.DateTimeField(null=True, blank=True)
    nullified_at = models.DateTimeField(null=True, blank=True)
    reason = models.TextField(blank=True)
    
    is_late = models.BooleanField(default=False, db_index=True)
    intended_batch = models.CharField(max_length=20, blank=True)
    batch = models.CharField(max_length=20, blank=True, db_index=True)
    issuance_group = models.CharField(max_length=40, blank=True, db_index=True)

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
        if not self.batch:
            from django.utils import timezone
            from datetime import timedelta
            from .views.helpers import load_schedule
            reference_time = self.issued_at or timezone.now()
            local_hour = (reference_time + timedelta(hours=8)).hour
            schedule = load_schedule()
            for key, shift in schedule.items():
                if shift["startHour"] <= local_hour < shift["endHour"]:
                    self.batch = key
                    break
        super().save(*args, **kwargs)

class Requisition(models.Model):
    STATUS_CHOICES = [('PENDING', 'Pending'), ('APPROVED', 'Approved'), ('ISSUED', 'Issued')]

    date_requested = models.DateTimeField(auto_now_add=True)
    requested_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='requisitions_requested')
    approved_by_name = models.CharField(max_length=150, blank=True, default="")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    total_value = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Requisition #{self.pk} - {self.status}"


class TicketSeries(models.Model):
    series_no = models.CharField(max_length=50, unique=True, db_index=True)
    ticket_form = models.ForeignKey('TicketForm', on_delete=models.SET_NULL, null=True, blank=True)

    pad_no = models.CharField(max_length=50, blank=True)
    box_no = models.CharField(max_length=50, blank=True)

    start_no = models.CharField(max_length=20)
    end_no = models.CharField(max_length=20)
    qty = models.PositiveIntegerField(default=0)
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

class RemittanceBatch(models.Model):
    batch_code = models.CharField(max_length=20, unique=True, blank=True, null=True)
    issued_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    issued_at = models.DateTimeField(auto_now_add=True)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    status = models.CharField(max_length=20, default="OPEN")

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

class RewardConfig(models.Model):
    # Earning rules
    points_per_queue = models.IntegerField(default=10)
    daily_bonus_4_threshold = models.IntegerField(default=4)
    daily_bonus_4_points = models.IntegerField(default=20)
    daily_bonus_5_threshold = models.IntegerField(default=5)
    daily_bonus_5_points = models.IntegerField(default=40)
    streak_bonus_days = models.IntegerField(default=5)
    streak_bonus_points = models.IntegerField(default=50)
    monthly_bonus_days = models.IntegerField(default=20)
    monthly_bonus_points = models.IntegerField(default=100)

    # Redemption rules
    points_per_redemption = models.IntegerField(default=1000)
    peso_value_per_redemption = models.DecimalField(max_digits=10, decimal_places=2, default=500)
    max_redemptions_per_year = models.IntegerField(default=2)
    cooldown_months = models.IntegerField(default=6)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.points_per_redemption} pts = ₱{self.peso_value_per_redemption}"

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class DriverRewardProfile(models.Model):
    driver = models.OneToOneField(Driver, on_delete=models.CASCADE, related_name='reward_profile')
    total_points = models.IntegerField(default=0)
    redemptions_this_year = models.IntegerField(default=0)
    last_redemption_date = models.DateField(null=True, blank=True)
    current_streak = models.IntegerField(default=0)
    last_queue_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.driver} — {self.total_points} pts"


class PointsTransaction(models.Model):
    TYPE_CHOICES = [
        ('QUEUE', 'Queue'),
        ('DAILY_BONUS_4', 'Daily Bonus (4 queues)'),
        ('DAILY_BONUS_5', 'Daily Bonus (5+ queues)'),
        ('STREAK_BONUS', 'Streak Bonus (5 days)'),
        ('MONTHLY_BONUS', 'Monthly Bonus (20+ days)'),
        ('REDEMPTION', 'Redemption'),
    ]

    profile = models.ForeignKey(DriverRewardProfile, on_delete=models.CASCADE, related_name='transactions')
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    points = models.IntegerField()
    description = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['profile', 'type', 'created_at'])]

    def __str__(self):
        return f"{self.profile.driver} {self.type} {self.points:+d}"


class Redemption(models.Model):
    STATUS_CHOICES = [('PENDING', 'Pending'), ('APPROVED', 'Approved'), ('REJECTED', 'Rejected')]

    profile = models.ForeignKey(DriverRewardProfile, on_delete=models.CASCADE, related_name='redemptions')
    points_redeemed = models.IntegerField(default=1000)
    peso_value = models.DecimalField(max_digits=10, decimal_places=2, default=500)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.profile.driver} — ₱{self.peso_value} ({self.status})"


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
