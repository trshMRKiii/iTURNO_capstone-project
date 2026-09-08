from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0054_remotebackfillrequest'),
    ]

    operations = [
        migrations.AlterField(
            model_name='driver',
            name='middle_name',
            field=models.CharField(blank=True, db_index=True, max_length=100),
        ),
    ]
