import datetime

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("employees", "0021_purchaseorder"),
    ]

    operations = [
        migrations.AddField(
            model_name="purchaseorder",
            name="poDate",
            field=models.DateField(default=datetime.date(2026, 4, 3)),
            preserve_default=False,
        ),
    ]
