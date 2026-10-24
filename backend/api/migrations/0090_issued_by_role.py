from django.db import migrations, models


def backfill_batch_role(apps, schema_editor):
    # Best effort for existing batches: the issuer's current role is all we have.
    RemittanceBatch = apps.get_model('api', 'RemittanceBatch')
    for batch in RemittanceBatch.objects.filter(issued_by__isnull=False).select_related('issued_by'):
        batch.issued_by_role = batch.issued_by.role
        batch.save(update_fields=['issued_by_role'])


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0089_kiosk_plan_desk_recipes'),
    ]

    operations = [
        migrations.AddField(
            model_name='requisition',
            name='issued_by_role',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.AddField(
            model_name='remittancebatch',
            name='issued_by_role',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.RunPython(backfill_batch_role, migrations.RunPython.noop),
    ]
