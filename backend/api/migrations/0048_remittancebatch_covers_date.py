from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0047_wipmode'),
    ]

    operations = [
        migrations.AddField(
            model_name='remittancebatch',
            name='covers_date',
            field=models.DateField(blank=True, null=True),
        ),
    ]
