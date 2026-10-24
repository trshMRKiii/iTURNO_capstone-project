from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0087_ticket_bay_swap_reason'),
    ]

    operations = [
        migrations.AddField(
            model_name='ticket',
            name='checked_out_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
