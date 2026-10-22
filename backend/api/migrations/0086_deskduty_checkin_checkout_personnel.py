import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def cancel_unpaid_visits(apps, schema_editor):
    # Payment is now taken at check-in, so a visit that never got "Mark paid" has no series
    # to check out with — it would only dead-end at the kiosk.
    apps.get_model('api', 'KioskSession').objects.filter(status='AWAITING_PAYMENT').update(status='CANCELLED')


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0085_ticket_checked_in_at'),
    ]

    operations = [
        migrations.RunPython(cancel_unpaid_visits, migrations.RunPython.noop),
        migrations.CreateModel(
            name='DeskDuty',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('checkin_user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('checkout_user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('series', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='api.ticketseries')),
            ],
        ),
        migrations.AddField(
            model_name='ticket',
            name='checked_in_by_name',
            field=models.CharField(blank=True, default='', max_length=150),
        ),
        migrations.AddField(
            model_name='ticket',
            name='checked_out_by_name',
            field=models.CharField(blank=True, default='', max_length=150),
        ),
        migrations.RemoveField(model_name='kiosksession', name='paid_at'),
        migrations.RenameField(model_name='kiosksession', old_name='paid_by_name', new_name='checked_in_by_name'),
        migrations.AlterField(
            model_name='kiosksession',
            name='status',
            field=models.CharField(choices=[('PAID', 'Paid'), ('DONE', 'Done'), ('CANCELLED', 'Cancelled')], db_index=True, default='PAID', max_length=20),
        ),
    ]
