from rest_framework import serializers

from .models import (
    CostEstimationRate,
    CostEstimationSheet,
    CostEstimationSheetRow,
    DispatchSummary,
    Item,
    ItemFolder,
    OpeningStock,
    OpeningStockRow,
    SalesServiceRequest,
)


class BlankableFloatField(serializers.FloatField):
    def to_internal_value(self, data):
        if data in ("", None):
            if self.allow_null:
                return None
        return super().to_internal_value(data)


class BlankableIntegerField(serializers.IntegerField):
    def to_internal_value(self, data):
        if data in ("", None):
            if self.allow_null:
                return None
        return super().to_internal_value(data)


class ItemSerializer(serializers.ModelSerializer):

    class Meta:
        model = Item
        fields = "__all__"


class ItemFolderSerializer(serializers.ModelSerializer):
    mrp = BlankableFloatField(required=False, allow_null=True)
    purchasePrice = BlankableFloatField(required=False, allow_null=True)
    salesPrice = BlankableFloatField(required=False, allow_null=True)
    minimumOrderQty = BlankableIntegerField(required=False, allow_null=True)
    minimumStockQty = BlankableIntegerField(required=False, allow_null=True)
    itemImage = serializers.FileField(required=False, allow_null=True)

    class Meta:
        model = ItemFolder
        fields = "__all__"
        read_only_fields = ("id", "created_at")
        extra_kwargs = {
            "itemCode": {"required": False, "allow_blank": True},
            "unit": {"required": False, "allow_blank": True},
            "itemType": {"required": False, "allow_blank": True},
            "hsnCode": {"required": False, "allow_blank": True},
            "itemName": {"required": False, "allow_blank": True},
            "tax": {"required": False, "allow_blank": True},
            "categoryName": {"required": False, "allow_blank": True},
            "partNo": {"required": False, "allow_blank": True},
            "itemGroup": {"required": False, "allow_blank": True},
            "batchNo": {"required": False, "allow_blank": True},
            "itemDescription": {"required": False, "allow_blank": True},
        }


class DispatchSummarySerializer(serializers.ModelSerializer):

    class Meta:
        model = DispatchSummary
        fields = "__all__"


class SalesServiceRequestSerializer(serializers.ModelSerializer):
    clientImage = serializers.FileField(required=False, allow_null=True)

    class Meta:
        model = SalesServiceRequest
        fields = "__all__"
        read_only_fields = ("id", "created_at")

    def validate(self, attrs):
        request_date = attrs.get("requestDate")
        required_delivery_date = attrs.get("requiredDeliveryDate")

        if request_date and required_delivery_date and required_delivery_date < request_date:
            raise serializers.ValidationError(
                {
                    "requiredDeliveryDate": "Required delivery date cannot be before the request date."
                }
            )

        return attrs

    def validate_clientImage(self, value):
        if not value:
            return value

        content_type = str(getattr(value, "content_type", "") or "").lower()
        file_name = str(getattr(value, "name", "") or "").lower()

        if content_type == "application/pdf" or file_name.endswith(".pdf"):
            return value

        raise serializers.ValidationError("Upload a PDF file only.")


class CostEstimationRateSerializer(serializers.ModelSerializer):

    class Meta:
        model = CostEstimationRate
        fields = "__all__"
        read_only_fields = ("id",)


class CostEstimationSheetRowSerializer(serializers.ModelSerializer):

    class Meta:
        model = CostEstimationSheetRow
        fields = (
            "id",
            "section",
            "itemName",
            "secondaryLabel",
            "secondaryValue",
            "unit",
            "rate",
            "quantity",
            "total",
            "displayOrder",
        )
        read_only_fields = ("id",)


class CostEstimationSheetSerializer(serializers.ModelSerializer):
    salesServiceRequestId = serializers.PrimaryKeyRelatedField(
        queryset=SalesServiceRequest.objects.all(),
        source="salesServiceRequest",
        write_only=True,
    )
    costEstimationNo = serializers.CharField(read_only=True)
    referenceNo = serializers.CharField(source="salesServiceRequest.referenceNo", read_only=True)
    clientName = serializers.CharField(source="salesServiceRequest.clientName", read_only=True)
    companyName = serializers.CharField(source="salesServiceRequest.companyName", read_only=True)
    phoneNo = serializers.CharField(source="salesServiceRequest.phoneNo", read_only=True)
    overallStatus = serializers.SerializerMethodField()
    rows = CostEstimationSheetRowSerializer(many=True)

    class Meta:
        model = CostEstimationSheet
        fields = (
            "id",
            "salesServiceRequestId",
            "costEstimationNo",
            "referenceNo",
            "clientName",
            "companyName",
            "phoneNo",
            "sentToHead",
            "hodStatus",
            "hodComment",
            "mdStatus",
            "mdComment",
            "overallStatus",
            "taxPercentage",
            "profitMarginPercentage",
            "rawMaterialTotal",
            "processTotal",
            "laborTotal",
            "testingTotal",
            "packagingTotal",
            "overheadTotal",
            "miscellaneousTotal",
            "subtotal",
            "taxAmount",
            "profitMarginAmount",
            "finalBatteryCost",
            "costPerUnit",
            "rows",
            "created_at",
        )
        read_only_fields = (
            "id",
            "costEstimationNo",
            "referenceNo",
            "clientName",
            "companyName",
            "phoneNo",
            "sentToHead",
            "hodStatus",
            "hodComment",
            "mdStatus",
            "mdComment",
            "overallStatus",
            "rawMaterialTotal",
            "processTotal",
            "laborTotal",
            "testingTotal",
            "packagingTotal",
            "overheadTotal",
            "miscellaneousTotal",
            "subtotal",
            "taxAmount",
            "profitMarginAmount",
            "finalBatteryCost",
            "costPerUnit",
            "created_at",
        )

    def get_overallStatus(self, obj):
        return obj.get_overall_status()

    def validate_rows(self, value):
        if not value:
            raise serializers.ValidationError("Add at least one cost estimation row.")

        for row in value:
            if row["quantity"] <= 0:
                raise serializers.ValidationError("Each row quantity must be greater than 0.")
            if row["rate"] < 0:
                raise serializers.ValidationError("Each row rate must be 0 or greater.")

        return value

    def _prepare_sheet_values(self, validated_data):
        rows_data = validated_data.pop("rows", [])
        sales_service_request = validated_data["salesServiceRequest"]
        totals_by_section = {
            "raw_material": 0,
            "manufacturing": 0,
            "labor": 0,
            "testing": 0,
            "packaging": 0,
            "overhead": 0,
            "miscellaneous": 0,
        }

        normalised_rows = []
        for index, row in enumerate(rows_data, start=1):
            rate = float(row.get("rate") or 0)
            quantity = float(row.get("quantity") or 0)
            total = rate * quantity
            section = row["section"]
            totals_by_section[section] = totals_by_section.get(section, 0) + total
            normalised_rows.append(
                {
                    **row,
                    "rate": rate,
                    "quantity": quantity,
                    "total": total,
                    "displayOrder": row.get("displayOrder") or index,
                }
            )

        subtotal = sum(totals_by_section.values())
        tax_percentage = float(validated_data.get("taxPercentage") or 0)
        profit_margin_percentage = float(validated_data.get("profitMarginPercentage") or 0)
        tax_amount = subtotal * tax_percentage / 100
        profit_margin_amount = subtotal * profit_margin_percentage / 100
        final_battery_cost = subtotal + tax_amount + profit_margin_amount
        requested_quantity = float(getattr(sales_service_request, "quantity", 0) or 0)
        cost_per_unit = final_battery_cost / requested_quantity if requested_quantity > 0 else 0

        return (
            validated_data,
            normalised_rows,
            {
                "rawMaterialTotal": totals_by_section["raw_material"],
                "processTotal": totals_by_section["manufacturing"],
                "laborTotal": totals_by_section["labor"],
                "testingTotal": totals_by_section["testing"],
                "packagingTotal": totals_by_section["packaging"],
                "overheadTotal": totals_by_section["overhead"],
                "miscellaneousTotal": totals_by_section["miscellaneous"],
                "subtotal": subtotal,
                "taxAmount": tax_amount,
                "profitMarginAmount": profit_margin_amount,
                "finalBatteryCost": final_battery_cost,
                "costPerUnit": cost_per_unit,
            },
        )

    def _save_rows(self, sheet, normalised_rows):
        CostEstimationSheetRow.objects.bulk_create(
            [
                CostEstimationSheetRow(
                    sheet=sheet,
                    section=row["section"],
                    itemName=row["itemName"],
                    secondaryLabel=row.get("secondaryLabel", ""),
                    secondaryValue=row.get("secondaryValue", ""),
                    unit=row.get("unit", ""),
                    rate=row["rate"],
                    quantity=row["quantity"],
                    total=row["total"],
                    displayOrder=row["displayOrder"],
                )
                for row in normalised_rows
            ]
        )

    def create(self, validated_data):
        validated_data, normalised_rows, computed_values = self._prepare_sheet_values(
            validated_data,
        )

        sheet = CostEstimationSheet.objects.create(
            **validated_data,
            **computed_values,
        )

        self._save_rows(sheet, normalised_rows)

        return sheet

    def update(self, instance, validated_data):
        rows_data = validated_data.pop("rows", None)

        if rows_data is None:
            rows_data = [
                {
                    "section": row.section,
                    "itemName": row.itemName,
                    "secondaryLabel": row.secondaryLabel,
                    "secondaryValue": row.secondaryValue,
                    "unit": row.unit,
                    "rate": row.rate,
                    "quantity": row.quantity,
                    "total": row.total,
                    "displayOrder": row.displayOrder,
                }
                for row in instance.rows.all().order_by("displayOrder", "id")
            ]

        payload = {
            "salesServiceRequest": validated_data.get(
                "salesServiceRequest",
                instance.salesServiceRequest,
            ),
            "taxPercentage": validated_data.get("taxPercentage", instance.taxPercentage),
            "profitMarginPercentage": validated_data.get(
                "profitMarginPercentage",
                instance.profitMarginPercentage,
            ),
            "rows": rows_data,
        }
        payload, normalised_rows, computed_values = self._prepare_sheet_values(payload)

        for field_name, field_value in {**payload, **computed_values}.items():
            setattr(instance, field_name, field_value)

        instance.sentToHead = False
        instance.hodStatus = CostEstimationSheet.APPROVAL_PENDING
        instance.hodComment = ""
        instance.mdStatus = CostEstimationSheet.APPROVAL_PENDING
        instance.mdComment = ""

        instance.save()
        instance.rows.all().delete()
        self._save_rows(instance, normalised_rows)

        return instance


class OpeningStockRowSerializer(serializers.ModelSerializer):
    itemId = serializers.SerializerMethodField()
    itemCode = serializers.SerializerMethodField()
    itemName = serializers.SerializerMethodField()
    unit = serializers.SerializerMethodField()

    class Meta:
        model = OpeningStockRow
        fields = ("id", "itemId", "itemCode", "itemName", "unit", "quantity")
        read_only_fields = ("id",)

    def get_itemId(self, obj):
        return str(obj.item_id) if obj.item_id else ""

    def get_itemCode(self, obj):
        return getattr(obj.item, "itemCode", "") or obj.itemCode or ""

    def get_itemName(self, obj):
        return getattr(obj.item, "itemName", "") or obj.itemName or ""

    def get_unit(self, obj):
        return getattr(obj.item, "unit", "") or obj.unit or ""


class OpeningStockSerializer(serializers.ModelSerializer):
    header = serializers.SerializerMethodField()
    rows = OpeningStockRowSerializer(many=True, read_only=True)

    class Meta:
        model = OpeningStock
        fields = ("id", "header", "rows", "created_at")
        read_only_fields = ("id", "created_at", "header", "rows")

    def get_header(self, obj):
        return {
            "date": obj.date or "",
            "code": obj.code or "",
        }
