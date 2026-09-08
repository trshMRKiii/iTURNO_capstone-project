from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0056_alter_user_managers_and_more'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.RenameIndex(
                    model_name='vehicle',
                    old_name='api_vehicle_route_21f689_idx',
                    new_name='api_vehicle_route_i_33d88b_idx',
                ),
            ],
            database_operations=[
                migrations.AddIndex(
                    model_name='vehicle',
                    index=models.Index(fields=['route', 'is_archived'], name='api_vehicle_route_i_33d88b_idx'),
                ),
            ],
        ),
    ]
