from django.db import migrations, models


def delete_cancelled(apps, schema_editor):
    apps.get_model('api', 'Ticket').objects.filter(status='CANCELLED').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0090_issued_by_role'),
    ]

    operations = [
        migrations.RunPython(delete_cancelled, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='ticket',
            name='status',
            field=models.CharField(choices=[('QUEUED', 'Queued'), ('COLLECTED', 'Collected')], default='QUEUED', max_length=20),
        ),
    ]
