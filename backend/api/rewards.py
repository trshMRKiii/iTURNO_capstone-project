from datetime import date, timedelta
from django.db.models import Count
from django.utils import timezone

from .models import DriverRewardProfile, PointsTransaction, Redemption, Ticket, RewardConfig


def get_or_create_profile(driver):
    profile, _ = DriverRewardProfile.objects.get_or_create(driver=driver)
    return profile


def award_queue_point(driver, queue_date=None):
    config = RewardConfig.get_solo()
    profile = get_or_create_profile(driver)
    if queue_date is None:
        queue_date = (timezone.now() + timedelta(hours=8)).date()

    PointsTransaction.objects.create(
        profile=profile, type='QUEUE', points=config.points_per_queue,
        description=f"Queue logged on {queue_date}",
    )
    profile.total_points += config.points_per_queue

    _check_daily_bonus(profile, driver, queue_date, config)
    _check_streak_bonus(profile, queue_date, config)
    _check_monthly_bonus(profile, driver, queue_date, config)

    profile.last_queue_date = queue_date
    profile.save()


def _check_daily_bonus(profile, driver, queue_date, config):
    day_count = Ticket.objects.filter(
        driver=driver, status='ISSUED', issued_at__date=queue_date
    ).count()

    already_got_4 = PointsTransaction.objects.filter(
        profile=profile, type='DAILY_BONUS_4',
        created_at__date=queue_date
    ).exists()
    already_got_5 = PointsTransaction.objects.filter(
        profile=profile, type='DAILY_BONUS_5',
        created_at__date=queue_date
    ).exists()

    if day_count >= config.daily_bonus_5_threshold and not already_got_5:
        if already_got_4:
            profile.total_points -= config.daily_bonus_4_points
            PointsTransaction.objects.filter(
                profile=profile, type='DAILY_BONUS_4',
                created_at__date=queue_date
            ).delete()
        PointsTransaction.objects.create(
            profile=profile, type='DAILY_BONUS_5', points=config.daily_bonus_5_points,
            description=f"{config.daily_bonus_5_threshold}+ queues on {queue_date}",
        )
        profile.total_points += config.daily_bonus_5_points
    elif day_count == config.daily_bonus_4_threshold and not already_got_4 and not already_got_5:
        PointsTransaction.objects.create(
            profile=profile, type='DAILY_BONUS_4', points=config.daily_bonus_4_points,
            description=f"{config.daily_bonus_4_threshold} queues on {queue_date}",
        )
        profile.total_points += config.daily_bonus_4_points


def _check_streak_bonus(profile, queue_date, config):
    if profile.last_queue_date == queue_date:
        return

    if profile.last_queue_date == queue_date - timedelta(days=1):
        profile.current_streak += 1
    else:
        profile.current_streak = 1

    if profile.current_streak >= config.streak_bonus_days and profile.current_streak % config.streak_bonus_days == 0:
        PointsTransaction.objects.create(
            profile=profile, type='STREAK_BONUS', points=config.streak_bonus_points,
            description=f"{config.streak_bonus_days}-day consecutive streak ending {queue_date}",
        )
        profile.total_points += config.streak_bonus_points


def _check_monthly_bonus(profile, driver, queue_date, config):
    month_start = queue_date.replace(day=1)
    next_month = (month_start + timedelta(days=32)).replace(day=1)

    active_days = Ticket.objects.filter(
        driver=driver,
        issued_at__date__gte=month_start,
        issued_at__date__lt=next_month,
    ).values('issued_at__date').distinct().count()

    if active_days >= config.monthly_bonus_days:
        already = PointsTransaction.objects.filter(
            profile=profile, type='MONTHLY_BONUS',
            created_at__date__gte=month_start,
            created_at__date__lt=next_month,
        ).exists()
        if not already:
            PointsTransaction.objects.create(
                profile=profile, type='MONTHLY_BONUS', points=config.monthly_bonus_points,
                description=f"{config.monthly_bonus_days}+ queue days in {queue_date.strftime('%B %Y')}",
            )
            profile.total_points += config.monthly_bonus_points


def can_redeem(profile):
    config = RewardConfig.get_solo()
    today = (timezone.now() + timedelta(hours=8)).date()
    current_year = today.year

    if profile.total_points < config.points_per_redemption:
        return False, f"Insufficient points (need {config.points_per_redemption:,})"

    year_redemptions = Redemption.objects.filter(
        profile=profile, status='APPROVED',
        created_at__year=current_year,
    ).count()
    if year_redemptions >= config.max_redemptions_per_year:
        return False, f"Maximum {config.max_redemptions_per_year} redemptions per year reached"

    last = Redemption.objects.filter(
        profile=profile, status='APPROVED'
    ).order_by('-created_at').first()
    if last:
        d = last.created_at.date()
        month = d.month + config.cooldown_months
        year = d.year + (month - 1) // 12
        month = (month - 1) % 12 + 1
        day = min(d.day, [31,29 if year%4==0 and (year%100!=0 or year%400==0) else 28,31,30,31,30,31,31,30,31,30,31][month-1])
        cooldown_end = date(year, month, day)
        if today < cooldown_end:
            return False, f"Cooldown active until {cooldown_end.strftime('%B %d, %Y')}"

    return True, "Eligible"


def redeem_points(profile, approved_by=None):
    eligible, reason = can_redeem(profile)
    if not eligible:
        return None, reason

    config = RewardConfig.get_solo()

    profile.total_points -= config.points_per_redemption
    profile.last_redemption_date = (timezone.now() + timedelta(hours=8)).date()
    profile.save()

    PointsTransaction.objects.create(
        profile=profile, type='REDEMPTION', points=-config.points_per_redemption,
        description=f"Redeemed {config.points_per_redemption:,} pts for ₱{config.peso_value_per_redemption}",
    )

    redemption = Redemption.objects.create(
        profile=profile,
        points_redeemed=config.points_per_redemption,
        peso_value=config.peso_value_per_redemption,
        status='APPROVED',
        approved_by=approved_by,
    )

    return redemption, "Success"
