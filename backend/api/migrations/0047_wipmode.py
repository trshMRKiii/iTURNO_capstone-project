from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0046_name_snapshots'),
    ]

    operations = [
        migrations.CreateModel(
            name='WipMode',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('is_active', models.BooleanField(default=False)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
        ),
    ]
