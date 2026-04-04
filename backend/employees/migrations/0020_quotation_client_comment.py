from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("employees", "0019_quotation_client_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="quotation",
            name="clientComment",
            field=models.TextField(blank=True, default=""),
        ),
    ]
