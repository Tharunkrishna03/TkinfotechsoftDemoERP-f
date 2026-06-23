from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("employees", "0028_jobcard_quotation_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="jobcard",
            name="sentToHod",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="jobcard",
            name="storeManagerApproved",
            field=models.BooleanField(default=False),
        ),
    ]
