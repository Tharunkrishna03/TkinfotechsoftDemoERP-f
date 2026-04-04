from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("employees", "0018_quotation_approval_workflow"),
    ]

    operations = [
        migrations.AddField(
            model_name="quotation",
            name="clientStatus",
            field=models.CharField(
                choices=[
                    ("pending", "Pending"),
                    ("accepted", "Accepted"),
                    ("rejected", "Rejected"),
                ],
                default="pending",
                max_length=20,
            ),
        ),
    ]
