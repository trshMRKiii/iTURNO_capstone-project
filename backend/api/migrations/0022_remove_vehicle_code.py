from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0021_add_beginning_balance_to_ticketseries'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='vehicle',
            name='code',
        ),
    ]
