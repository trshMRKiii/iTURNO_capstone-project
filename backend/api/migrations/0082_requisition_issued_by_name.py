from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0081_backupsettings'),
    ]

    operations = [
        migrations.RenameField(
            model_name='requisition',
            old_name='approved_by_name',
            new_name='issued_by_name',
        ),
    ]
