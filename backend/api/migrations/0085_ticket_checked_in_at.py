from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0084_kiosksession'),
    ]

    operations = [
        migrations.AddField(
            model_name='ticket',
            name='checked_in_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
