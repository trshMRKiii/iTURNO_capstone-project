import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def link_users_by_name(apps, schema_editor):
    """Old tickets only carry name snapshots: link each to its user when exactly one account
    has that display name, and leave it unlinked (the name still shows) when it is ambiguous."""
    User = apps.get_model('api', 'User')
    Ticket = apps.get_model('api', 'Ticket')
    by_name = {}
    for pk, first, last, username in User.objects.values_list('pk', 'first_name', 'last_name', 'username'):
        by_name.setdefault(f"{first} {last}".strip() or username, []).append(pk)
    for name, pks in by_name.items():
        if len(pks) != 1:
            continue
        Ticket.objects.filter(checked_in_by_name=name, checked_in_by__isnull=True).update(checked_in_by=pks[0])
        Ticket.objects.filter(checked_out_by_name=name, checked_out_by__isnull=True).update(checked_out_by=pks[0])


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0093_remove_driver_photo'),
    ]

    operations = [
        migrations.AddField(
            model_name='ticket',
            name='checked_in_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='ticket',
            name='checked_out_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL),
        ),
        migrations.RunPython(link_users_by_name, migrations.RunPython.noop),
    ]
