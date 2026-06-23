from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("employees", "0030_jobcard_store_manager_comment"),
    ]

    operations = [
        migrations.AddField(
            model_name="jobcard",
            name="grnNo",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
        migrations.AddField(
            model_name="jobcard",
            name="sentToStoreManager",
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name="OperationRegister",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("operationNo", models.CharField(max_length=20, unique=True)),
                ("opDate", models.DateField()),
                (
                    "shopFloorIncharge",
                    models.CharField(
                        blank=True,
                        choices=[
                            ("supervisor_1", "Supervisor 1"),
                            ("supervisor_2", "Supervisor 2"),
                            ("supervisor_3", "Supervisor 3"),
                        ],
                        default="",
                        max_length=30,
                    ),
                ),
                ("remarks", models.TextField(blank=True, default="")),
                ("assignedToSiteEngineer", models.BooleanField(default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "jobCard",
                    models.OneToOneField(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="operationRegister",
                        to="employees.jobcard",
                    ),
                ),
            ],
            options={
                "ordering": ("-created_at", "-id"),
            },
        ),
    ]
