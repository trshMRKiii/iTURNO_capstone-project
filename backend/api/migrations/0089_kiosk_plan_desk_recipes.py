from django.db import migrations, models


def sessions_to_plans(apps, schema_editor):
    """Open visits keep what they would have drawn: their one series, `quantity` times."""
    KioskSession = apps.get_model('api', 'KioskSession')
    for session in KioskSession.objects.exclude(series__isnull=True).select_related('series'):
        if session.series.ticket_form_id:
            session.plan = [{'form': session.series.ticket_form_id, 'qty': session.quantity, 'series': session.series_id}]
            session.save(update_fields=['plan'])


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0088_ticket_checked_out_at'),
    ]

    operations = [
        migrations.AddField(
            model_name='deskduty',
            name='recipes',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='kiosksession',
            name='plan',
            field=models.JSONField(default=list),
        ),
        migrations.RunPython(sessions_to_plans, migrations.RunPython.noop),
        migrations.RemoveField(model_name='kiosksession', name='series'),
        migrations.RemoveField(model_name='kiosksession', name='quantity'),
    ]
