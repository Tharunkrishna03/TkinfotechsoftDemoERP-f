from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("employees", "0029_jobcard_store_manager_workflow"),
    ]

    operations = [
        migrations.AddField(
            model_name="jobcard",
            name="storeManagerComment",
            field=models.TextField(blank=True, default=""),
        ),
    ]
