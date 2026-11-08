from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0095_ticket_overstay_minutes'),
    ]

    operations = [
        migrations.AlterField(
            model_name='ticket',
            name='driver',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='tickets', to='api.driver'),
        ),
        migrations.AlterField(
            model_name='kiosksession',
            name='driver',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='kiosk_sessions', to='api.driver'),
        ),
    ]
