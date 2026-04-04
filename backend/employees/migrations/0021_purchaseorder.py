from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("employees", "0020_quotation_client_comment"),
    ]

    operations = [
        migrations.CreateModel(
            name="PurchaseOrder",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("purchaseOrderNo", models.CharField(max_length=20, unique=True)),
                ("poReceivedDate", models.DateField()),
                ("expectedDate", models.DateField()),
                ("poReference", models.FileField(upload_to="purchase-orders/")),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                (
                    "quotation",
                    models.OneToOneField(
                        on_delete=models.PROTECT,
                        related_name="purchaseOrder",
                        to="employees.quotation",
                    ),
                ),
            ],
            options={
                "ordering": ("-created_at", "-id"),
            },
        ),
    ]
