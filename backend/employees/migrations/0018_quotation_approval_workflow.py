from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("employees", "0017_quotation_snapshot_layer"),
    ]

    operations = [
        migrations.AddField(
            model_name="quotation",
            name="hodComment",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="quotation",
            name="hodStatus",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("approved", "Approved"),
                    ("declined", "Declined"),
                ],
                default="pending",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="quotation",
            name="mdComment",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="quotation",
            name="mdStatus",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("approved", "Approved"),
                    ("declined", "Declined"),
                ],
                default="pending",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="quotation",
            name="sentToHead",
            field=models.BooleanField(default=False),
        ),
    ]
