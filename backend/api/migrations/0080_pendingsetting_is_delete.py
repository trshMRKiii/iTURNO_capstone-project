from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0079_pendingaccountemail'),
    ]

    operations = [
        migrations.AddField(
            model_name='pendingsetting',
            name='is_delete',
            field=models.BooleanField(default=False),
        ),
    ]
