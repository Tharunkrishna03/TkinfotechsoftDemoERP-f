from django.db import migrations, models


def _build_rfq_scope_snapshot(request_item):
    candidate_details = []

    if request_item is None:
        return candidate_details

    scope_area = str(getattr(request_item, "scopeArea", "") or "")
    candidate_details.extend(line.strip() for line in scope_area.splitlines() if line.strip())

    for battery_service in getattr(request_item, "batteryServices", []) or []:
        label = str(battery_service or "").strip()
        if label:
            candidate_details.append(label)

    if getattr(request_item, "requestType", "") == "manufacturing":
        for manufacturing_item in getattr(request_item, "manufacturingItems", []) or []:
            if not isinstance(manufacturing_item, dict):
                continue
            parts = [
                str(manufacturing_item.get("itemName") or "").strip(),
                str(manufacturing_item.get("quantity") or "").strip(),
                str(manufacturing_item.get("unit") or "").strip(),
            ]
            label = " ".join(part for part in parts if part).strip()
            if label:
                candidate_details.append(label)

    if not candidate_details:
        parts = [
            str(getattr(request_item, "itemName", "") or "").strip(),
            str(getattr(request_item, "quantity", "") or "").strip(),
            str(getattr(request_item, "unit", "") or "").strip(),
        ]
        label = " ".join(part for part in parts if part).strip()
        if label:
            candidate_details.append(label)

    unique_details = []
    for detail in candidate_details:
        if detail and detail not in unique_details:
            unique_details.append(detail)

    return unique_details


def _build_cost_breakdown_snapshot(sheet, quotation):
    if sheet is None:
        total_cost = float(getattr(quotation, "totalCost", 0) or 0)
        return {
            "rawMaterialTotal": 0,
            "processTotal": 0,
            "laborTotal": 0,
            "testingTotal": 0,
            "packagingTotal": 0,
            "overheadTotal": 0,
            "miscellaneousTotal": 0,
            "subtotal": total_cost,
            "taxPercentage": 0,
            "taxAmount": 0,
            "profitMarginPercentage": 0,
            "profitMarginAmount": 0,
            "finalBatteryCost": total_cost,
            "costPerUnit": 0,
        }

    return {
        "rawMaterialTotal": float(getattr(sheet, "rawMaterialTotal", 0) or 0),
        "processTotal": float(getattr(sheet, "processTotal", 0) or 0),
        "laborTotal": float(getattr(sheet, "laborTotal", 0) or 0),
        "testingTotal": float(getattr(sheet, "testingTotal", 0) or 0),
        "packagingTotal": float(getattr(sheet, "packagingTotal", 0) or 0),
        "overheadTotal": float(getattr(sheet, "overheadTotal", 0) or 0),
        "miscellaneousTotal": float(getattr(sheet, "miscellaneousTotal", 0) or 0),
        "subtotal": float(getattr(sheet, "subtotal", 0) or 0),
        "taxPercentage": float(getattr(sheet, "taxPercentage", 0) or 0),
        "taxAmount": float(getattr(sheet, "taxAmount", 0) or 0),
        "profitMarginPercentage": float(getattr(sheet, "profitMarginPercentage", 0) or 0),
        "profitMarginAmount": float(getattr(sheet, "profitMarginAmount", 0) or 0),
        "finalBatteryCost": float(getattr(sheet, "finalBatteryCost", 0) or 0),
        "costPerUnit": float(getattr(sheet, "costPerUnit", 0) or 0),
    }


def populate_quotation_snapshots(apps, schema_editor):
    Quotation = apps.get_model("employees", "Quotation")

    for quotation in Quotation.objects.select_related(
        "salesServiceRequest",
        "costEstimationSheet",
    ).all():
        request_item = getattr(quotation, "salesServiceRequest", None)
        quotation.rfqScope = _build_rfq_scope_snapshot(request_item) or list(
            getattr(quotation, "scopeDetails", []) or []
        )
        quotation.rfqRemarks = str(getattr(request_item, "planningRemarks", "") or "")
        quotation.rfqContactMode = str(getattr(request_item, "modeOfContact", "") or "")
        quotation.costBreakdown = _build_cost_breakdown_snapshot(
            getattr(quotation, "costEstimationSheet", None),
            quotation,
        )
        quotation.save(
            update_fields=[
                "rfqScope",
                "rfqRemarks",
                "rfqContactMode",
                "costBreakdown",
            ]
        )


class Migration(migrations.Migration):

    dependencies = [
        ("employees", "0016_quotation"),
    ]

    operations = [
        migrations.RenameField(
            model_name="quotation",
            old_name="revisedNo",
            new_name="revisionNo",
        ),
        migrations.AddField(
            model_name="quotation",
            name="costBreakdown",
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name="quotation",
            name="rfqContactMode",
            field=models.CharField(blank=True, default="", max_length=20),
        ),
        migrations.AddField(
            model_name="quotation",
            name="rfqRemarks",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="quotation",
            name="rfqScope",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.RunPython(populate_quotation_snapshots, migrations.RunPython.noop),
    ]
