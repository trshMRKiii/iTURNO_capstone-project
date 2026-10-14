from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0078_drop_unused_columns_and_roaminglog'),
    ]

    operations = [
        migrations.CreateModel(
            name='PendingAccountEmail',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('user_id', models.IntegerField(unique=True)),
                ('temp_password', models.CharField(max_length=64)),
                ('queued_at', models.DateTimeField(auto_now=True)),
            ],
        ),
    ]
