from django.contrib.auth.models import AbstractUser
from django.db import models

# Create your models here.
class User(AbstractUser):
    ROLE_CHOICES = [('PERSONNEL', 'Personnel'), ('SUPERVISOR', 'Supervisor'), ('MANAGER', 'Manager'), ('ADMIN', 'Admin')]
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='PERSONNEL')
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
    code = models.CharField(max_length=20, unique=True, editable=False)
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

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if not self.code:
            self.code = f"VHC{str(self.id).zfill(3)}"
            super().save(update_fields=['code'])


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
    
    is_late = models.BooleanField(default=False, db_index=True)  # True = issued late (missed intended batch)
    intended_batch = models.CharField(max_length=20, blank=True)  # e.g. "Batch 1" — the batch it should have been in
    
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
        super().save(*args, **kwargs)

class Requisition(models.Model):
    STATUS_CHOICES = [('PENDING', 'Pending'), ('APPROVED', 'Approved'), ('ISSUED', 'Issued')]

    date_requested = models.DateTimeField(auto_now_add=True)
    requested_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='requisitions_requested')
    approved_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='requisitions_approved')
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

class Denomination(models.Model):
    value = models.DecimalField(max_digits=10, decimal_places=2)
    label = models.CharField(max_length=50)
    type = models.CharField(max_length=10, choices=[("bill","Bill"),("coin","Coin")], default="bill")

    def __str__(self):
        return self.label

class RemittanceBatch(models.Model):
    issued_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    issued_at = models.DateTimeField(auto_now_add=True)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    status = models.CharField(max_length=20, default="OPEN")

class Collection(models.Model):
    batch = models.ForeignKey(RemittanceBatch, related_name="collections", on_delete=models.CASCADE)
    ticket_form_no = models.CharField(max_length=50, blank=True, null=True)
    from_no = models.CharField(max_length=20, blank=True, null=True)
    to_no = models.CharField(max_length=20, blank=True, null=True)
    amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)

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

class Deposit(models.Model):
    batch = models.ForeignKey(RemittanceBatch, related_name="deposits", on_delete=models.CASCADE)
    type = models.CharField(max_length=10, choices=[("bill","Bill"),("coin","Coin")])
    denomination = models.IntegerField(default=0)
    quantity = models.IntegerField(default=0)
    deposit_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
