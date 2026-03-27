from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("employees", "0012_costestimationsheet_costestimationno"),
    ]

    operations = [
        migrations.AddField(
            model_name="costestimationsheet",
            name="hodComment",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="costestimationsheet",
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
            model_name="costestimationsheet",
            name="mdComment",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="costestimationsheet",
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
            model_name="costestimationsheet",
            name="sentToHead",
            field=models.BooleanField(default=False),
        ),
    ]
