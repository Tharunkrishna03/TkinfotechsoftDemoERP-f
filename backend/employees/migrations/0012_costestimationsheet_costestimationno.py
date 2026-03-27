from django.db import migrations, models


def populate_cost_estimation_numbers(apps, schema_editor):
    CostEstimationSheet = apps.get_model("employees", "CostEstimationSheet")

    counters_by_year = {}
    sheets = (
        CostEstimationSheet.objects.select_related("salesServiceRequest")
        .order_by("created_at", "id")
    )

    for sheet in sheets:
        request_date = getattr(getattr(sheet, "salesServiceRequest", None), "requestDate", None)
        reference_date = request_date or getattr(sheet, "created_at", None)
        year_suffix = reference_date.strftime("%y") if reference_date else "00"
        counters_by_year[year_suffix] = counters_by_year.get(year_suffix, 0) + 1
        sheet.costEstimationNo = f"CST-{year_suffix}-{counters_by_year[year_suffix]:04d}"
        sheet.save(update_fields=["costEstimationNo"])


def clear_cost_estimation_numbers(apps, schema_editor):
    CostEstimationSheet = apps.get_model("employees", "CostEstimationSheet")
    CostEstimationSheet.objects.update(costEstimationNo="")


class Migration(migrations.Migration):

    dependencies = [
        ("employees", "0011_costestimationsheet_costestimationsheetrow"),
    ]

    operations = [
        migrations.AddField(
            model_name="costestimationsheet",
            name="costEstimationNo",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
        migrations.RunPython(
            populate_cost_estimation_numbers,
            clear_cost_estimation_numbers,
        ),
        migrations.AlterField(
            model_name="costestimationsheet",
            name="costEstimationNo",
            field=models.CharField(max_length=20, unique=True),
        ),
    ]
