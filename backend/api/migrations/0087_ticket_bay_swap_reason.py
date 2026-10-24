from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0086_deskduty_checkin_checkout_personnel'),
    ]

    operations = [
        migrations.AddField(
            model_name='ticket',
            name='bay_swap_reason',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
    ]
