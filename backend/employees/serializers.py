import re

from rest_framework import serializers

from .models import (
    CostEstimationRate,
    CostEstimationSheet,
    CostEstimationSheetRow,
    DispatchSummary,
    Item,
    ItemFolder,
    JobCard,
    OperationRegister,
    OpeningStock,
    OpeningStockRow,
    PurchaseOrder,
    Quotation,
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


BATTERY_SERVICE_OPTIONS = (
    "Battery Inspection",
    "Battery Installation",
    "Battery Testing",
    "Battery Maintenance",
    "Battery Repair",
    "Battery Replacement",
)
IMAGE_FILE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif")
FIXED_QUOTATION_PAYMENT_TERMS_TYPE = "100% Advance"
FIXED_QUOTATION_PAYMENT_TERMS = (
    "100% advance payment to be released against quotation confirmation before execution and dispatch."
)


def _stringify(value):
    return str(value or "").strip()


def _parse_positive_integer(value):
    if value in ("", None):
        return None

    try:
        parsed_value = int(value)
    except (TypeError, ValueError):
        return None

    return parsed_value if parsed_value > 0 else None


def _is_pdf_upload(value):
    if not value:
        return False

    content_type = str(getattr(value, "content_type", "") or "").lower()
    file_name = str(getattr(value, "name", "") or "").lower()
    return content_type == "application/pdf" or file_name.endswith(".pdf")


def _is_image_upload(value):
    if not value:
        return False

    content_type = str(getattr(value, "content_type", "") or "").lower()
    file_name = str(getattr(value, "name", "") or "").lower()
    return content_type.startswith("image/") or file_name.endswith(IMAGE_FILE_EXTENSIONS)


def _split_non_empty_lines(value):
    return [line.strip() for line in str(value or "").splitlines() if line.strip()]


def _deduplicate_lines(values):
    unique_values = []
    for value in values:
        label = _stringify(value)
        if label and label not in unique_values:
            unique_values.append(label)
    return unique_values


def _format_material_or_service_line(item_name="", quantity=None, unit=""):
    parts = [_stringify(item_name)]

    if quantity not in ("", None, 0, "0"):
        parts.append(_stringify(quantity))

    unit_value = _stringify(unit)
    if unit_value:
        parts.append(unit_value)

    return " ".join(part for part in parts if part).strip()


def _get_job_card_source_purchase_order(source):
    return getattr(source, "purchaseOrder", None) if isinstance(source, JobCard) else (
        source if isinstance(source, PurchaseOrder) else None
    )


def _get_job_card_source_quotation(source):
    if isinstance(source, Quotation):
        return source

    direct_quotation = getattr(source, "quotation", None)
    if direct_quotation is not None:
        return direct_quotation

    purchase_order = _get_job_card_source_purchase_order(source)
    if purchase_order is not None:
        return getattr(purchase_order, "quotation", None)

    return None


def _get_job_card_source_request_item(source):
    quotation = _get_job_card_source_quotation(source)
    if quotation is None:
        return None
    return getattr(quotation, "salesServiceRequest", None)


def _job_card_requires_store_manager_approval(source):
    request_item = _get_job_card_source_request_item(source)
    return (
        request_item is not None
        and getattr(request_item, "rfqType", "") == SalesServiceRequest.RFQ_TYPE_WORKSHOP
    )


def _get_job_card_cost_estimation_sheet(source):
    quotation = _get_job_card_source_quotation(source)
    if quotation is None:
        return None

    sheet = getattr(quotation, "costEstimationSheet", None)
    if sheet is not None:
        return sheet

    request_item = getattr(quotation, "salesServiceRequest", None)
    if request_item is None:
        return None

    latest_sheet = request_item.costEstimationSheets.order_by("-created_at", "-id").first()
    if latest_sheet is not None and latest_sheet.get_overall_status() == CostEstimationSheet.APPROVAL_APPROVED:
        return latest_sheet

    return None


def _build_job_card_cost_estimation_lines(source, included_sections):
    sheet = _get_job_card_cost_estimation_sheet(source)
    if sheet is None:
        return []

    rows = list(getattr(sheet, "rows", []).all()) if hasattr(getattr(sheet, "rows", None), "all") else []
    if not rows:
        return []

    lines = []
    for row in rows:
        if included_sections and row.section not in included_sections:
            continue

        line = _format_material_or_service_line(row.itemName, row.quantity, row.unit)
        if line:
            lines.append(line)

    return _deduplicate_lines(lines)


def _build_job_card_scope_lines(source):
    quotation = _get_job_card_source_quotation(source)
    request_item = _get_job_card_source_request_item(source)
    scope_details = []

    if quotation is not None and isinstance(getattr(quotation, "rfqScope", None), list):
        scope_details.extend(quotation.rfqScope)
    elif quotation is not None and isinstance(getattr(quotation, "scopeDetails", None), list):
        scope_details.extend(quotation.scopeDetails)

    if request_item is not None and not scope_details:
        scope_details.extend(_split_non_empty_lines(getattr(request_item, "scopeArea", "")))
        scope_details.extend(getattr(request_item, "batteryServices", []) or [])

    return _deduplicate_lines(scope_details)


def _build_job_card_scope_details(source):
    scope_details = _build_job_card_scope_lines(source)

    excluded_lines = set(
        _build_job_card_materials(source) + _build_job_card_services(source)
    )

    return [
        line
        for line in scope_details
        if line not in excluded_lines
    ]


def _build_job_card_materials(source):
    request_item = _get_job_card_source_request_item(source)
    materials = _build_job_card_cost_estimation_lines(source, {"raw_material"})

    if materials:
        return materials

    if request_item is None:
        return materials

    for manufacturing_item in getattr(request_item, "manufacturingItems", []) or []:
        if not isinstance(manufacturing_item, dict):
            continue

        material_line = _format_material_or_service_line(
            manufacturing_item.get("itemName"),
            manufacturing_item.get("quantity"),
            manufacturing_item.get("unit"),
        )
        if material_line:
            materials.append(material_line)

    if not materials:
        fallback_line = _format_material_or_service_line(
            getattr(request_item, "itemName", ""),
            getattr(request_item, "quantity", None),
            getattr(request_item, "unit", ""),
        )
        if fallback_line:
            materials.append(fallback_line)

    return _deduplicate_lines(materials)


def _build_job_card_services(source):
    request_item = _get_job_card_source_request_item(source)
    services = _build_job_card_cost_estimation_lines(
        source,
        {"manufacturing", "labor", "testing", "packaging"},
    )

    if services:
        return services

    if request_item is None:
        return services

    services.extend(getattr(request_item, "batteryServices", []) or [])

    if getattr(request_item, "requestType", "") == SalesServiceRequest.REQUEST_TYPE_SERVICE:
        services.extend(_split_non_empty_lines(getattr(request_item, "scopeArea", "")))

    return _deduplicate_lines(services)


def _merge_scope_area(services, scope_area):
    manual_lines = [
        line for line in _split_non_empty_lines(scope_area) if line not in BATTERY_SERVICE_OPTIONS
    ]
    merged_lines = []

    for line in [*(services or []), *manual_lines]:
        if line and line not in merged_lines:
            merged_lines.append(line)

    return "\n".join(merged_lines)


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
    rfqType = serializers.ChoiceField(
        choices=SalesServiceRequest.RFQ_TYPE_CHOICES,
        required=False,
        allow_blank=True,
    )
    rfqCategory = serializers.ChoiceField(
        choices=SalesServiceRequest.RFQ_CATEGORY_CHOICES,
        required=False,
        allow_blank=True,
    )
    salesExecutive = serializers.ChoiceField(
        choices=SalesServiceRequest.SALES_EXECUTIVE_CHOICES,
        required=False,
        allow_blank=True,
    )
    modeOfContact = serializers.ChoiceField(
        choices=SalesServiceRequest.CONTACT_MODE_CHOICES,
        required=False,
        allow_blank=True,
    )
    planningType = serializers.ChoiceField(
        choices=SalesServiceRequest.PLANNING_TYPE_CHOICES,
        required=False,
        allow_blank=True,
    )
    planStartDate = serializers.DateField(required=False, allow_null=True)
    planEndDate = serializers.DateField(required=False, allow_null=True)
    requiredDeliveryDate = serializers.DateField(required=False, allow_null=True)
    requestType = serializers.ChoiceField(
        choices=SalesServiceRequest.REQUEST_TYPE_CHOICES,
        required=False,
        allow_blank=True,
    )
    emailReferenceNumber = serializers.CharField(required=False, allow_blank=True)
    phoneNo = serializers.CharField(required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    batteryServices = serializers.ListField(
        child=serializers.CharField(),
        required=False,
    )
    manufacturingItems = serializers.ListField(
        child=serializers.DictField(),
        required=False,
    )
    itemName = serializers.CharField(required=False, allow_blank=True)
    quantity = BlankableIntegerField(required=False, allow_null=True, min_value=0)
    unit = serializers.CharField(required=False, allow_blank=True)
    scopeArea = serializers.CharField(required=False, allow_blank=True)
    planningRemarks = serializers.CharField(required=False, allow_blank=True)
    paymentTerms = serializers.CharField(required=False, allow_blank=True)
    taxPreference = serializers.CharField(required=False, allow_blank=True)
    deliveryLocation = serializers.CharField(required=False, allow_blank=True)
    deliveryMode = serializers.CharField(required=False, allow_blank=True)
    clientImage = serializers.FileField(required=False, allow_null=True)
    hasCostEstimation = serializers.SerializerMethodField()
    hasQuotation = serializers.SerializerMethodField()
    hasPurchaseOrder = serializers.SerializerMethodField()
    purchaseOrderNo = serializers.SerializerMethodField()

    class Meta:
        model = SalesServiceRequest
        fields = "__all__"
        read_only_fields = (
            "id",
            "created_at",
            "hasCostEstimation",
            "hasQuotation",
            "hasPurchaseOrder",
            "purchaseOrderNo",
        )

    def _get_existing_value(self, field_name, default=""):
        if not self.instance:
            return default
        return getattr(self.instance, field_name, default)

    def _normalise_manufacturing_items(self, raw_items, fallback_item):
        candidate_items = raw_items if isinstance(raw_items, list) and raw_items else []

        if (
            not candidate_items
            and (
                _stringify(fallback_item.get("itemName"))
                or fallback_item.get("quantity") not in ("", None, 0)
                or _stringify(fallback_item.get("unit"))
            )
        ):
            candidate_items = [fallback_item]

        if not candidate_items:
            return [], "Add at least one manufacturing item."

        normalised_items = []
        for index, raw_item in enumerate(candidate_items, start=1):
            if not isinstance(raw_item, dict):
                return [], f"Manufacturing item {index} is invalid."

            item_id = _stringify(raw_item.get("itemId"))
            item = None
            if item_id:
                try:
                    parsed_item_id = int(item_id)
                except (TypeError, ValueError):
                    return [], f"Manufacturing item {index} is invalid."

                item = ItemFolder.objects.filter(id=parsed_item_id).first()
                if item is None:
                    return [], f"Manufacturing item {index} does not exist."

            item_name = _stringify(getattr(item, "itemName", "") or raw_item.get("itemName"))
            quantity = _parse_positive_integer(raw_item.get("quantity"))
            unit = _stringify(getattr(item, "unit", "") or raw_item.get("unit"))

            if not item_name:
                return [], f"Manufacturing item {index} needs an item name."

            if quantity is None:
                return [], f"Manufacturing item {index} needs a valid quantity."

            if not unit:
                return [], f"Manufacturing item {index} needs a unit."

            normalised_items.append(
                {
                    "itemId": str(item.id) if item else item_id,
                    "itemName": item_name,
                    "quantity": quantity,
                    "unit": unit,
                }
            )

        return normalised_items, ""

    def validate(self, attrs):
        request_date = attrs.get("requestDate", self._get_existing_value("requestDate", None))
        required_delivery_date = attrs.get(
            "requiredDeliveryDate",
            self._get_existing_value("requiredDeliveryDate", None),
        )
        rfq_type = _stringify(
            attrs.get("rfqType", self._get_existing_value("rfqType", "")),
        ).lower()
        rfq_category = _stringify(
            attrs.get("rfqCategory", self._get_existing_value("rfqCategory", "")),
        ).lower()
        sales_executive = _stringify(
            attrs.get("salesExecutive", self._get_existing_value("salesExecutive", "")),
        ).lower()
        mode_of_contact = _stringify(
            attrs.get("modeOfContact", self._get_existing_value("modeOfContact", "")),
        ).lower()
        request_type = _stringify(
            attrs.get("requestType", self._get_existing_value("requestType", "")),
        ).lower()
        phone_no = _stringify(attrs.get("phoneNo", self._get_existing_value("phoneNo", "")))
        email = _stringify(attrs.get("email", self._get_existing_value("email", "")))
        email_reference_number = _stringify(
            attrs.get(
                "emailReferenceNumber",
                self._get_existing_value("emailReferenceNumber", ""),
            ),
        )
        battery_services = attrs.get(
            "batteryServices",
            self._get_existing_value("batteryServices", []),
        )
        manufacturing_items = attrs.get(
            "manufacturingItems",
            self._get_existing_value("manufacturingItems", []),
        )
        item_name = _stringify(attrs.get("itemName", self._get_existing_value("itemName", "")))
        quantity = attrs.get("quantity", self._get_existing_value("quantity", 0))
        unit = _stringify(attrs.get("unit", self._get_existing_value("unit", "")))
        scope_area = _stringify(attrs.get("scopeArea", self._get_existing_value("scopeArea", "")))
        planning_type = _stringify(
            attrs.get("planningType", self._get_existing_value("planningType", "")),
        ).lower()
        plan_start_date = attrs.get(
            "planStartDate",
            self._get_existing_value("planStartDate", None),
        )
        plan_end_date = attrs.get(
            "planEndDate",
            self._get_existing_value("planEndDate", None),
        )
        planning_remarks = _stringify(
            attrs.get("planningRemarks", self._get_existing_value("planningRemarks", "")),
        )
        payment_terms = _stringify(
            attrs.get("paymentTerms", self._get_existing_value("paymentTerms", "")),
        )
        tax_preference = _stringify(
            attrs.get("taxPreference", self._get_existing_value("taxPreference", "")),
        )
        delivery_location = _stringify(
            attrs.get("deliveryLocation", self._get_existing_value("deliveryLocation", "")),
        )
        delivery_mode = _stringify(
            attrs.get("deliveryMode", self._get_existing_value("deliveryMode", "")),
        )
        client_image = (
            attrs.get("clientImage")
            if "clientImage" in attrs
            else self._get_existing_value("clientImage", None)
        )
        errors = {}

        if not required_delivery_date and request_date:
            required_delivery_date = request_date

        if request_date and required_delivery_date and required_delivery_date < request_date:
            errors["requiredDeliveryDate"] = (
                "Required delivery date cannot be before the request date."
            )

        if not rfq_type:
            errors["rfqType"] = "Select the RFQ type."

        if not rfq_category:
            errors["rfqCategory"] = "Select the RFQ category."

        if not sales_executive:
            errors["salesExecutive"] = "Select the sales executive."

        if not request_type:
            if battery_services:
                request_type = SalesServiceRequest.REQUEST_TYPE_SERVICE
            elif manufacturing_items:
                request_type = SalesServiceRequest.REQUEST_TYPE_MANUFACTURING

        if mode_of_contact == SalesServiceRequest.CONTACT_MODE_PHONE:
            if not phone_no:
                errors["phoneNo"] = "Phone number is required."
            elif not re.match(r"^[0-9+\-\s()]{7,20}$", phone_no):
                errors["phoneNo"] = "Enter a valid phone number."
            if not client_image:
                errors["clientImage"] = "Upload a screenshot file."
            elif not _is_image_upload(client_image):
                errors["clientImage"] = "Upload an image file only."
            email = ""
            email_reference_number = ""
        elif mode_of_contact == SalesServiceRequest.CONTACT_MODE_EMAIL:
            if not email:
                errors["email"] = "Email is required."
            if not email_reference_number:
                errors["emailReferenceNumber"] = "Email reference number is required."
            if not client_image:
                errors["clientImage"] = "Upload a PDF file."
            elif not _is_pdf_upload(client_image):
                errors["clientImage"] = "Upload a PDF file only."
            phone_no = ""
        else:
            if not phone_no:
                errors["phoneNo"] = "Phone number is required."
            elif not re.match(r"^[0-9+\-\s()]{7,20}$", phone_no):
                errors["phoneNo"] = "Enter a valid phone number."

            if not email:
                errors["email"] = "Email is required."

        if request_type == SalesServiceRequest.REQUEST_TYPE_SERVICE:
            if not isinstance(battery_services, list):
                battery_services = []

            normalised_services = []
            for raw_service in battery_services:
                service_name = _stringify(raw_service)
                if not service_name:
                    continue
                if service_name not in normalised_services:
                    normalised_services.append(service_name)

            attrs["batteryServices"] = normalised_services
            attrs["manufacturingItems"] = []
            attrs["scopeArea"] = _merge_scope_area(normalised_services, scope_area)
            item_name = ""
            quantity = 0
            unit = ""
        elif request_type == SalesServiceRequest.REQUEST_TYPE_MANUFACTURING:
            normalised_items, item_error = self._normalise_manufacturing_items(
                manufacturing_items,
                {
                    "itemName": item_name,
                    "quantity": quantity,
                    "unit": unit,
                },
            )

            if item_error:
                errors["manufacturingItems"] = item_error
            else:
                attrs["manufacturingItems"] = normalised_items
                attrs["batteryServices"] = []
                attrs["scopeArea"] = ""
                item_name = normalised_items[0]["itemName"]
                quantity = normalised_items[0]["quantity"]
                unit = normalised_items[0]["unit"]
        else:
            if not item_name:
                errors["itemName"] = "Item name is required."

            parsed_quantity = _parse_positive_integer(quantity)
            if parsed_quantity is None:
                errors["quantity"] = "Quantity must be a whole number greater than 0."
            else:
                quantity = parsed_quantity

            if not unit:
                errors["unit"] = "Unit is required."

        if (
            rfq_category != SalesServiceRequest.RFQ_CATEGORY_STANDARD
            and request_date
        ):
            plan_start_date = request_date
            plan_end_date = request_date

        if planning_type or plan_start_date or plan_end_date or planning_remarks:
            if not planning_type:
                errors["planningType"] = "Select the planning type."
            if not plan_start_date:
                errors["planStartDate"] = "Plan start date is required."
            if not plan_end_date:
                errors["planEndDate"] = "Plan end date is required."
            elif plan_start_date and plan_end_date < plan_start_date:
                errors["planEndDate"] = "Plan end date cannot be before the plan start date."

        attrs["phoneNo"] = phone_no
        attrs["email"] = email
        attrs["emailReferenceNumber"] = email_reference_number
        attrs["rfqType"] = rfq_type
        attrs["rfqCategory"] = rfq_category
        attrs["salesExecutive"] = sales_executive
        attrs["itemName"] = item_name
        attrs["quantity"] = int(quantity or 0)
        attrs["unit"] = unit
        attrs["scopeArea"] = attrs.get("scopeArea", scope_area)
        attrs["planningType"] = planning_type
        attrs["planStartDate"] = plan_start_date
        attrs["planEndDate"] = plan_end_date
        attrs["planningRemarks"] = planning_remarks
        attrs["requiredDeliveryDate"] = required_delivery_date
        attrs["paymentTerms"] = payment_terms
        attrs["taxPreference"] = tax_preference
        attrs["deliveryLocation"] = delivery_location
        attrs["deliveryMode"] = delivery_mode

        if mode_of_contact:
            attrs["modeOfContact"] = mode_of_contact
        if request_type:
            attrs["requestType"] = request_type

        if errors:
            raise serializers.ValidationError(errors)

        return attrs

    def validate_clientImage(self, value):
        if not value:
            return value

        mode_of_contact = _stringify(
            self.initial_data.get(
                "modeOfContact",
                self._get_existing_value("modeOfContact", ""),
            ),
        ).lower()

        if _is_pdf_upload(value):
            return value

        if (
            mode_of_contact == SalesServiceRequest.CONTACT_MODE_PHONE
            and _is_image_upload(value)
        ):
            return value

        raise serializers.ValidationError("Upload a PDF file only.")

    def get_hasCostEstimation(self, obj):
        prefetched_objects = getattr(obj, "_prefetched_objects_cache", {})
        if "costEstimationSheets" in prefetched_objects:
            return bool(prefetched_objects["costEstimationSheets"])
        return obj.costEstimationSheets.exists()

    def get_hasQuotation(self, obj):
        prefetched_objects = getattr(obj, "_prefetched_objects_cache", {})
        if "quotations" in prefetched_objects:
            return bool(prefetched_objects["quotations"])
        return obj.quotations.exists()

    def get_hasPurchaseOrder(self, obj):
        prefetched_objects = getattr(obj, "_prefetched_objects_cache", {})
        if "quotations" in prefetched_objects:
            return any(hasattr(quotation, "purchaseOrder") for quotation in prefetched_objects["quotations"])
        return PurchaseOrder.objects.filter(quotation__salesServiceRequest=obj).exists()

    def get_purchaseOrderNo(self, obj):
        prefetched_objects = getattr(obj, "_prefetched_objects_cache", {})
        if "quotations" in prefetched_objects:
            for quotation in prefetched_objects["quotations"]:
                purchase_order = getattr(quotation, "purchaseOrder", None)
                if purchase_order is not None:
                    return purchase_order.purchaseOrderNo or ""
            return ""

        return (
            PurchaseOrder.objects.filter(quotation__salesServiceRequest=obj)
            .values_list("purchaseOrderNo", flat=True)
            .first()
            or ""
        )


class QuotationSerializer(serializers.ModelSerializer):
    salesServiceRequestId = serializers.PrimaryKeyRelatedField(
        queryset=SalesServiceRequest.objects.all(),
        source="salesServiceRequest",
        write_only=True,
    )
    costEstimationSheetId = serializers.PrimaryKeyRelatedField(
        queryset=CostEstimationSheet.objects.all(),
        source="costEstimationSheet",
        write_only=True,
        required=False,
        allow_null=True,
    )
    quotationCode = serializers.CharField(read_only=True)
    referenceNo = serializers.CharField(read_only=True)
    costEstimationNo = serializers.CharField(read_only=True)
    attentionName = serializers.CharField(required=False, allow_blank=True)
    companyName = serializers.CharField(required=False, allow_blank=True)
    scopeDetails = serializers.ListField(
        child=serializers.CharField(),
        required=False,
    )
    totalCost = serializers.FloatField(required=False)
    quoteValidityDays = BlankableIntegerField(required=False, allow_null=True, min_value=0)
    revisedNo = BlankableIntegerField(required=False, allow_null=True, min_value=0)
    revisionNo = serializers.IntegerField(source="revisedNo", read_only=True)
    overallStatus = serializers.SerializerMethodField(method_name="get_overall_status")
    hasPurchaseOrder = serializers.SerializerMethodField()
    purchaseOrderId = serializers.SerializerMethodField()
    purchaseOrderNo = serializers.SerializerMethodField()
    hasJobCard = serializers.SerializerMethodField()
    jobCardId = serializers.SerializerMethodField()
    jobCardNo = serializers.SerializerMethodField()
    workflowNotice = serializers.SerializerMethodField()
    rfqCategory = serializers.CharField(source="salesServiceRequest.rfqCategory", read_only=True)
    rfqCategoryLabel = serializers.SerializerMethodField()
    planningType = serializers.CharField(source="salesServiceRequest.planningType", read_only=True)
    paymentTermsType = serializers.CharField(required=False, allow_blank=True)
    paymentTerms = serializers.CharField(required=False, allow_blank=True)
    deliveryTermsType = serializers.CharField(required=False, allow_blank=True)
    deliveryTerms = serializers.CharField(required=False, allow_blank=True)
    termsType = serializers.CharField(required=False, allow_blank=True)
    terms = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = Quotation
        fields = "__all__"
        read_only_fields = (
            "id",
            "quotationCode",
            "referenceNo",
            "costEstimationNo",
            "created_at",
            "salesServiceRequest",
            "costEstimationSheet",
            "revisionNo",
            "overallStatus",
            "rfqScope",
            "rfqRemarks",
            "rfqContactMode",
            "costBreakdown",
            "hasPurchaseOrder",
            "purchaseOrderId",
            "purchaseOrderNo",
            "hasJobCard",
            "jobCardId",
            "jobCardNo",
            "workflowNotice",
            "rfqCategory",
            "rfqCategoryLabel",
            "planningType",
        )

    def _get_existing_value(self, field_name, default=None):
        if not self.instance:
            return default
        return getattr(self.instance, field_name, default)

    def _build_scope_details(self, request_item, scope_details):
        candidate_details = []

        if isinstance(scope_details, list):
            candidate_details.extend(_stringify(detail) for detail in scope_details)

        if request_item:
            candidate_details.extend(_split_non_empty_lines(request_item.scopeArea))

            for battery_service in request_item.batteryServices or []:
                candidate_details.append(_stringify(battery_service))

            if getattr(request_item, "requestType", "") == SalesServiceRequest.REQUEST_TYPE_MANUFACTURING:
                for manufacturing_item in request_item.manufacturingItems or []:
                    if not isinstance(manufacturing_item, dict):
                        continue
                    item_name = _stringify(manufacturing_item.get("itemName"))
                    quantity = _stringify(manufacturing_item.get("quantity"))
                    unit = _stringify(manufacturing_item.get("unit"))
                    label = " ".join(part for part in (item_name, quantity, unit) if part).strip()
                    if label:
                        candidate_details.append(label)

            if not candidate_details:
                label = " ".join(
                    part
                    for part in (
                        _stringify(request_item.itemName),
                        _stringify(request_item.quantity),
                        _stringify(request_item.unit),
                    )
                    if part
                ).strip()
                if label:
                    candidate_details.append(label)

        normalised_details = []
        for detail in candidate_details:
            if detail and detail not in normalised_details:
                normalised_details.append(detail)

        return normalised_details

    def _get_latest_approved_cost_estimation(self, request_item):
        if request_item is None:
            return None

        latest_sheet = request_item.costEstimationSheets.order_by("-created_at", "-id").first()
        if (
            latest_sheet is not None
            and latest_sheet.get_overall_status() == CostEstimationSheet.APPROVAL_APPROVED
        ):
            return latest_sheet
        return None

    def _build_rfq_scope_snapshot(self, request_item):
        if request_item is None:
            return []

        scope_snapshot = _split_non_empty_lines(getattr(request_item, "scopeArea", ""))

        if not scope_snapshot:
            for battery_service in getattr(request_item, "batteryServices", []) or []:
                service_label = _stringify(battery_service)
                if service_label:
                    scope_snapshot.append(service_label)

        if (
            not scope_snapshot
            and getattr(request_item, "requestType", "") == SalesServiceRequest.REQUEST_TYPE_MANUFACTURING
        ):
            for manufacturing_item in getattr(request_item, "manufacturingItems", []) or []:
                if not isinstance(manufacturing_item, dict):
                    continue

                label = " ".join(
                    part
                    for part in (
                        _stringify(manufacturing_item.get("itemName")),
                        _stringify(manufacturing_item.get("quantity")),
                        _stringify(manufacturing_item.get("unit")),
                    )
                    if part
                ).strip()
                if label:
                    scope_snapshot.append(label)

        if not scope_snapshot:
            label = " ".join(
                part
                for part in (
                    _stringify(getattr(request_item, "itemName", "")),
                    _stringify(getattr(request_item, "quantity", "")),
                    _stringify(getattr(request_item, "unit", "")),
                )
                if part
            ).strip()
            if label:
                scope_snapshot.append(label)

        return scope_snapshot

    def _build_cost_breakdown_snapshot(self, sheet, total_cost):
        if sheet is None:
            fallback_total = float(total_cost or 0)
            return {
                "rawMaterialTotal": 0,
                "processTotal": 0,
                "laborTotal": 0,
                "testingTotal": 0,
                "packagingTotal": 0,
                "overheadTotal": 0,
                "miscellaneousTotal": 0,
                "subtotal": fallback_total,
                "taxPercentage": 0,
                "taxAmount": 0,
                "profitMarginPercentage": 0,
                "profitMarginAmount": 0,
                "finalBatteryCost": fallback_total,
                "costPerUnit": 0,
            }

        return {
            "rawMaterialTotal": float(sheet.rawMaterialTotal or 0),
            "processTotal": float(sheet.processTotal or 0),
            "laborTotal": float(sheet.laborTotal or 0),
            "testingTotal": float(sheet.testingTotal or 0),
            "packagingTotal": float(sheet.packagingTotal or 0),
            "overheadTotal": float(sheet.overheadTotal or 0),
            "miscellaneousTotal": float(sheet.miscellaneousTotal or 0),
            "subtotal": float(sheet.subtotal or 0),
            "taxPercentage": float(sheet.taxPercentage or 0),
            "taxAmount": float(sheet.taxAmount or 0),
            "profitMarginPercentage": float(sheet.profitMarginPercentage or 0),
            "profitMarginAmount": float(sheet.profitMarginAmount or 0),
            "finalBatteryCost": float(sheet.finalBatteryCost or 0),
            "costPerUnit": float(sheet.costPerUnit or 0),
        }

    def validate(self, attrs):
        sales_service_request = attrs.get(
            "salesServiceRequest",
            self._get_existing_value("salesServiceRequest", None),
        )
        cost_estimation_sheet = attrs.get(
            "costEstimationSheet",
            self._get_existing_value("costEstimationSheet", None),
        )
        quotation_date = attrs.get(
            "quotationDate",
            self._get_existing_value("quotationDate", None),
        )
        expiry_date = attrs.get(
            "expiryDate",
            self._get_existing_value("expiryDate", None),
        )
        payment_terms_type = _stringify(
            attrs.get(
                "paymentTermsType",
                self._get_existing_value(
                    "paymentTermsType",
                    FIXED_QUOTATION_PAYMENT_TERMS_TYPE,
                ),
            ),
        )
        payment_terms = _stringify(
            attrs.get(
                "paymentTerms",
                self._get_existing_value("paymentTerms", FIXED_QUOTATION_PAYMENT_TERMS),
            ),
        )
        delivery_terms_type = _stringify(
            attrs.get("deliveryTermsType", self._get_existing_value("deliveryTermsType", "")),
        )
        delivery_terms = _stringify(
            attrs.get("deliveryTerms", self._get_existing_value("deliveryTerms", "")),
        )
        terms_type = _stringify(
            attrs.get("termsType", self._get_existing_value("termsType", "")),
        )
        terms = _stringify(attrs.get("terms", self._get_existing_value("terms", "")))
        scope_details = self._build_scope_details(
            sales_service_request,
            attrs.get("scopeDetails", self._get_existing_value("scopeDetails", [])),
        )
        total_cost = attrs.get("totalCost", self._get_existing_value("totalCost", 0))
        errors = {}

        if sales_service_request is None:
            errors["salesServiceRequestId"] = "Select an attention name."
        elif (
            sales_service_request.rfqCategory
            != SalesServiceRequest.RFQ_CATEGORY_STANDARD
        ):
            errors["salesServiceRequestId"] = (
                "Quotations for quote of assessment and quote of completion RFQs are created automatically."
            )

        latest_approved_cost_estimation = None
        if sales_service_request is not None:
            latest_approved_cost_estimation = self._get_latest_approved_cost_estimation(
                sales_service_request,
            )
            if cost_estimation_sheet is None:
                cost_estimation_sheet = latest_approved_cost_estimation

        if cost_estimation_sheet is None:
            errors["costEstimationSheetId"] = (
                "Only the latest HOD and MD approved cost estimation sheet can be quoted."
            )
        elif (
            sales_service_request is not None
            and cost_estimation_sheet.salesServiceRequest_id != sales_service_request.id
        ):
            errors["costEstimationSheetId"] = "Selected cost estimation does not belong to the request."
        elif (
            latest_approved_cost_estimation is None
            or cost_estimation_sheet.id != latest_approved_cost_estimation.id
        ):
            errors["costEstimationSheetId"] = (
                "Only the latest HOD and MD approved cost estimation sheet can be quoted."
            )

        if quotation_date is None:
            errors["quotationDate"] = "Quotation date is required."

        if expiry_date is None:
            errors["expiryDate"] = "Expiry date is required."
        elif quotation_date is not None and expiry_date < quotation_date:
            errors["expiryDate"] = "Expiry date cannot be before quotation date."

        if not scope_details:
            errors["scopeDetails"] = "Scope details are required."

        payment_terms_type = FIXED_QUOTATION_PAYMENT_TERMS_TYPE
        payment_terms = FIXED_QUOTATION_PAYMENT_TERMS

        if not delivery_terms_type:
            errors["deliveryTermsType"] = "Select a delivery terms type."

        if not delivery_terms:
            errors["deliveryTerms"] = "Delivery terms are required."

        if not terms_type:
            errors["termsType"] = "Select a terms type."

        if not terms:
            errors["terms"] = "Terms are required."

        if cost_estimation_sheet is not None:
            total_cost = float(cost_estimation_sheet.finalBatteryCost or 0)

        if float(total_cost or 0) <= 0:
            errors["totalCost"] = "Cost estimation total must be greater than 0."

        if errors:
            raise serializers.ValidationError(errors)

        quote_validity_days = 0
        if quotation_date is not None and expiry_date is not None:
            quote_validity_days = max((expiry_date - quotation_date).days, 0)

        attrs["costEstimationSheet"] = cost_estimation_sheet
        attrs["quoteValidityDays"] = quote_validity_days
        attrs["scopeDetails"] = scope_details
        attrs["paymentTermsType"] = payment_terms_type
        attrs["paymentTerms"] = payment_terms
        attrs["deliveryTermsType"] = delivery_terms_type
        attrs["deliveryTerms"] = delivery_terms
        attrs["termsType"] = terms_type
        attrs["terms"] = terms
        attrs["totalCost"] = float(total_cost or 0)
        attrs["rfqScope"] = self._build_rfq_scope_snapshot(sales_service_request)
        attrs["rfqRemarks"] = _stringify(
            getattr(sales_service_request, "planningRemarks", ""),
        )
        attrs["rfqContactMode"] = _stringify(
            getattr(sales_service_request, "modeOfContact", ""),
        )
        attrs["costBreakdown"] = self._build_cost_breakdown_snapshot(
            cost_estimation_sheet,
            attrs["totalCost"],
        )

        if sales_service_request is not None:
            attrs["attentionName"] = _stringify(sales_service_request.clientName)
            attrs["companyName"] = _stringify(sales_service_request.companyName)
            attrs["referenceNo"] = _stringify(sales_service_request.referenceNo)

        if cost_estimation_sheet is not None:
            attrs["costEstimationNo"] = _stringify(cost_estimation_sheet.costEstimationNo)

        return attrs

    def get_overall_status(self, obj):
        return obj.get_overall_status()

    def get_hasPurchaseOrder(self, obj):
        return hasattr(obj, "purchaseOrder")

    def get_purchaseOrderId(self, obj):
        purchase_order = getattr(obj, "purchaseOrder", None)
        return purchase_order.id if purchase_order is not None else None

    def get_purchaseOrderNo(self, obj):
        purchase_order = getattr(obj, "purchaseOrder", None)
        return purchase_order.purchaseOrderNo if purchase_order is not None else ""

    def get_hasJobCard(self, obj):
        return hasattr(obj, "jobCard") or hasattr(getattr(obj, "purchaseOrder", None), "jobCard")

    def get_jobCardId(self, obj):
        job_card = getattr(obj, "jobCard", None)
        if job_card is not None:
            return job_card.id

        purchase_order = getattr(obj, "purchaseOrder", None)
        linked_job_card = getattr(purchase_order, "jobCard", None)
        return linked_job_card.id if linked_job_card is not None else None

    def get_jobCardNo(self, obj):
        job_card = getattr(obj, "jobCard", None)
        if job_card is not None:
            return job_card.jobCardNo or ""

        purchase_order = getattr(obj, "purchaseOrder", None)
        linked_job_card = getattr(purchase_order, "jobCard", None)
        return linked_job_card.jobCardNo if linked_job_card is not None else ""

    def get_workflowNotice(self, obj):
        direct_job_card = getattr(obj, "jobCard", None)
        if direct_job_card is not None:
            return f"Job card created as {direct_job_card.jobCardNo}."

        purchase_order = getattr(obj, "purchaseOrder", None)
        if purchase_order is None:
            return ""
        return f"Job card created as {purchase_order.purchaseOrderNo}."

    def get_rfqCategoryLabel(self, obj):
        request_item = getattr(obj, "salesServiceRequest", None)
        if request_item is None:
            return ""
        return request_item.get_rfqCategory_display() or ""


class PurchaseOrderSerializer(serializers.ModelSerializer):
    quotationId = serializers.PrimaryKeyRelatedField(
        queryset=Quotation.objects.select_related("salesServiceRequest", "costEstimationSheet"),
        source="quotation",
        write_only=True,
        required=False,
    )
    quotationCode = serializers.CharField(source="quotation.quotationCode", read_only=True)
    attentionName = serializers.CharField(source="quotation.attentionName", read_only=True)
    companyName = serializers.CharField(source="quotation.companyName", read_only=True)
    referenceNo = serializers.CharField(source="quotation.referenceNo", read_only=True)
    costEstimationNo = serializers.CharField(source="quotation.costEstimationNo", read_only=True)
    hasJobCard = serializers.SerializerMethodField()
    jobCardId = serializers.SerializerMethodField()
    jobCardNo = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrder
        fields = (
            "id",
            "quotationId",
            "quotation",
            "quotationCode",
            "attentionName",
            "companyName",
            "referenceNo",
            "costEstimationNo",
            "purchaseOrderNo",
            "poDate",
            "poReceivedDate",
            "expectedDate",
            "poReference",
            "hasJobCard",
            "jobCardId",
            "jobCardNo",
            "created_at",
        )
        read_only_fields = (
            "id",
            "quotation",
            "quotationCode",
            "attentionName",
            "companyName",
            "referenceNo",
            "costEstimationNo",
            "purchaseOrderNo",
            "hasJobCard",
            "jobCardId",
            "jobCardNo",
            "created_at",
        )

    def validate_poReference(self, value):
        if not value and self.instance is not None:
            return getattr(self.instance, "poReference", value)
        if _is_pdf_upload(value):
            return value
        raise serializers.ValidationError("Upload a PDF file only.")

    def validate(self, attrs):
        quotation = attrs.get("quotation")
        po_received_date = attrs.get("poReceivedDate")
        expected_date = attrs.get("expectedDate")
        errors = {}

        if self.instance is not None:
            current_quotation = getattr(self.instance, "quotation", None)
            if quotation is None:
                quotation = current_quotation
                attrs["quotation"] = current_quotation
            elif current_quotation is not None and quotation.id != current_quotation.id:
                errors["quotationId"] = "Quotation cannot be changed for an existing purchase order."

        if quotation is None:
            errors["quotationId"] = "Select a quotation."
        else:
            if quotation.get_overall_status() != Quotation.APPROVAL_APPROVED:
                errors["quotationId"] = (
                    "Purchase order can be created only for fully approved quotations."
                )
            elif quotation.clientStatus != Quotation.CLIENT_STATUS_ACCEPTED:
                errors["quotationId"] = (
                    "Purchase order can be created only for client-accepted quotations."
                )
            elif (
                hasattr(quotation, "purchaseOrder")
                and getattr(quotation.purchaseOrder, "id", None) != getattr(self.instance, "id", None)
            ):
                errors["quotationId"] = "A purchase order already exists for the selected quotation."

        if po_received_date is not None and expected_date is not None and expected_date < po_received_date:
            errors["expectedDate"] = "Expected date cannot be before the PO received date."

        if errors:
            raise serializers.ValidationError(errors)

        return attrs

    def to_representation(self, instance):
        representation = super().to_representation(instance)
        file_url = getattr(getattr(instance, "poReference", None), "url", "")
        request = self.context.get("request")

        if file_url:
            representation["poReference"] = (
                request.build_absolute_uri(file_url) if request is not None else file_url
            )
        else:
            representation["poReference"] = ""

        return representation

    def get_hasJobCard(self, obj):
        return hasattr(obj, "jobCard")

    def get_jobCardId(self, obj):
        job_card = getattr(obj, "jobCard", None)
        return job_card.id if job_card is not None else None

    def get_jobCardNo(self, obj):
        job_card = getattr(obj, "jobCard", None)
        return job_card.jobCardNo if job_card is not None else ""


class JobCardSerializer(serializers.ModelSerializer):
    purchaseOrderId = serializers.PrimaryKeyRelatedField(
        queryset=PurchaseOrder.objects.select_related("quotation__salesServiceRequest"),
        source="purchaseOrder",
        write_only=True,
        required=False,
    )
    quotationId = serializers.PrimaryKeyRelatedField(
        queryset=Quotation.objects.select_related("salesServiceRequest", "costEstimationSheet"),
        source="quotation",
        write_only=True,
        required=False,
    )
    purchaseOrderNo = serializers.SerializerMethodField()
    poDate = serializers.SerializerMethodField()
    quotationCode = serializers.SerializerMethodField()
    rfqNo = serializers.SerializerMethodField()
    rfqDate = serializers.SerializerMethodField()
    rfqType = serializers.SerializerMethodField()
    rfqTypeLabel = serializers.SerializerMethodField()
    rfqCategory = serializers.SerializerMethodField()
    rfqCategoryLabel = serializers.SerializerMethodField()
    planningType = serializers.SerializerMethodField()
    planningTypeLabel = serializers.SerializerMethodField()
    planStartDate = serializers.SerializerMethodField()
    planEndDate = serializers.SerializerMethodField()
    attentionName = serializers.SerializerMethodField()
    companyName = serializers.SerializerMethodField()
    scopeDetails = serializers.SerializerMethodField()
    materials = serializers.SerializerMethodField()
    services = serializers.SerializerMethodField()
    requiresStoreManagerApproval = serializers.SerializerMethodField()
    hasOperationRegister = serializers.SerializerMethodField()
    operationRegisterId = serializers.SerializerMethodField()

    class Meta:
        model = JobCard
        fields = (
            "id",
            "purchaseOrderId",
            "purchaseOrder",
            "quotationId",
            "quotation",
            "purchaseOrderNo",
            "poDate",
            "quotationCode",
            "rfqNo",
            "rfqDate",
            "rfqType",
            "rfqTypeLabel",
            "rfqCategory",
            "rfqCategoryLabel",
            "planningType",
            "planningTypeLabel",
            "planStartDate",
            "planEndDate",
            "attentionName",
            "companyName",
            "scopeDetails",
            "materials",
            "services",
            "jobCardNo",
            "jobCardDate",
            "planningDate",
            "expectedDate",
            "remarks",
            "deliveryRemark",
            "grnNo",
            "sentToStoreManager",
            "storeManagerApproved",
            "storeManagerComment",
            "sentToHod",
            "requiresStoreManagerApproval",
            "hasOperationRegister",
            "operationRegisterId",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "purchaseOrder",
            "quotation",
            "purchaseOrderNo",
            "poDate",
            "quotationCode",
            "rfqNo",
            "rfqDate",
            "rfqType",
            "rfqTypeLabel",
            "rfqCategory",
            "rfqCategoryLabel",
            "planningType",
            "planningTypeLabel",
            "planStartDate",
            "planEndDate",
            "attentionName",
            "companyName",
            "scopeDetails",
            "materials",
            "services",
            "jobCardNo",
            "grnNo",
            "sentToStoreManager",
            "storeManagerApproved",
            "storeManagerComment",
            "sentToHod",
            "requiresStoreManagerApproval",
            "hasOperationRegister",
            "operationRegisterId",
            "created_at",
            "updated_at",
        )

    def validate(self, attrs):
        purchase_order = attrs.get("purchaseOrder")
        quotation = attrs.get("quotation")
        job_card_date = attrs.get("jobCardDate")
        planning_date = attrs.get("planningDate")
        expected_date = attrs.get("expectedDate")
        errors = {}

        if self.instance is not None:
            current_purchase_order = getattr(self.instance, "purchaseOrder", None)
            current_quotation = getattr(self.instance, "quotation", None)
            if purchase_order is None:
                purchase_order = current_purchase_order
                attrs["purchaseOrder"] = current_purchase_order
            elif current_purchase_order is not None and purchase_order.id != current_purchase_order.id:
                errors["purchaseOrderId"] = "Purchase order cannot be changed for an existing job card."

            if quotation is None:
                quotation = current_quotation
                attrs["quotation"] = current_quotation
            elif current_quotation is not None and quotation.id != current_quotation.id:
                errors["quotationId"] = "Quotation cannot be changed for an existing job card."

            if job_card_date is None:
                job_card_date = getattr(self.instance, "jobCardDate", None)
            if planning_date is None:
                planning_date = getattr(self.instance, "planningDate", None)
            if expected_date is None:
                expected_date = getattr(self.instance, "expectedDate", None)

        if purchase_order is not None and quotation is not None:
            errors["quotationId"] = "Open a job card from either a purchase order or a direct quotation."

        if purchase_order is None and quotation is None:
            errors["purchaseOrderId"] = "Select a purchase order."

        if purchase_order is not None and (
            hasattr(purchase_order, "jobCard")
            and getattr(purchase_order.jobCard, "id", None) != getattr(self.instance, "id", None)
        ):
            errors["purchaseOrderId"] = "A job card already exists for the selected purchase order."

        if quotation is not None:
            if not quotation.uses_direct_job_card_flow():
                errors["quotationId"] = (
                    "Only quote of assessment and quote of completion quotations can open a job card without a purchase order."
                )
            elif quotation.get_overall_status() != Quotation.APPROVAL_APPROVED:
                errors["quotationId"] = (
                    "Direct job cards are available only after the quotation is fully approved."
                )
            elif (
                hasattr(quotation, "jobCard")
                and getattr(quotation.jobCard, "id", None) != getattr(self.instance, "id", None)
            ):
                errors["quotationId"] = "A job card already exists for the selected quotation."

        if job_card_date is None:
            errors["jobCardDate"] = "Job card date is required."

        if planning_date is None:
            errors["planningDate"] = "Planning date is required."

        if expected_date is None:
            errors["expectedDate"] = "Expected date is required."
        elif planning_date is not None and expected_date < planning_date:
            errors["expectedDate"] = "Expected date cannot be before the planning date."

        if errors:
            raise serializers.ValidationError(errors)

        return attrs

    def _get_source_purchase_order(self, obj):
        return getattr(obj, "purchaseOrder", None)

    def _get_source_quotation(self, obj):
        quotation = getattr(obj, "quotation", None)
        if quotation is not None:
            return quotation

        purchase_order = self._get_source_purchase_order(obj)
        if purchase_order is None:
            return None

        return getattr(purchase_order, "quotation", None)

    def _get_source_request_item(self, obj):
        quotation = self._get_source_quotation(obj)
        if quotation is None:
            return None
        return getattr(quotation, "salesServiceRequest", None)

    def get_purchaseOrderNo(self, obj):
        purchase_order = self._get_source_purchase_order(obj)
        return getattr(purchase_order, "purchaseOrderNo", "") or ""

    def get_poDate(self, obj):
        purchase_order = self._get_source_purchase_order(obj)
        po_date = getattr(purchase_order, "poDate", None)
        return po_date.isoformat() if po_date else ""

    def get_quotationCode(self, obj):
        quotation = self._get_source_quotation(obj)
        return getattr(quotation, "quotationCode", "") or ""

    def get_rfqNo(self, obj):
        request_item = self._get_source_request_item(obj)
        return getattr(request_item, "referenceNo", "") or ""

    def get_rfqDate(self, obj):
        request_item = self._get_source_request_item(obj)
        request_date = getattr(request_item, "requestDate", None)
        return request_date.isoformat() if request_date else ""

    def get_rfqType(self, obj):
        request_item = self._get_source_request_item(obj)
        return getattr(request_item, "rfqType", "") or ""

    def get_rfqTypeLabel(self, obj):
        request_item = self._get_source_request_item(obj)
        if request_item is None:
            return ""
        return request_item.get_rfqType_display() or ""

    def get_rfqCategory(self, obj):
        request_item = self._get_source_request_item(obj)
        return getattr(request_item, "rfqCategory", "") or ""

    def get_rfqCategoryLabel(self, obj):
        request_item = self._get_source_request_item(obj)
        if request_item is None:
            return ""
        return request_item.get_rfqCategory_display() or ""

    def get_planningType(self, obj):
        request_item = self._get_source_request_item(obj)
        return getattr(request_item, "planningType", "") or ""

    def get_planningTypeLabel(self, obj):
        request_item = self._get_source_request_item(obj)
        if request_item is None:
            return ""
        return request_item.get_planningType_display() or ""

    def get_planStartDate(self, obj):
        request_item = self._get_source_request_item(obj)
        plan_start_date = getattr(request_item, "planStartDate", None)
        return plan_start_date.isoformat() if plan_start_date else ""

    def get_planEndDate(self, obj):
        request_item = self._get_source_request_item(obj)
        plan_end_date = getattr(request_item, "planEndDate", None)
        return plan_end_date.isoformat() if plan_end_date else ""

    def get_attentionName(self, obj):
        quotation = self._get_source_quotation(obj)
        return getattr(quotation, "attentionName", "") or ""

    def get_companyName(self, obj):
        quotation = self._get_source_quotation(obj)
        return getattr(quotation, "companyName", "") or ""

    def get_scopeDetails(self, obj):
        return _build_job_card_scope_details(obj)

    def get_materials(self, obj):
        return _build_job_card_materials(obj)

    def get_services(self, obj):
        return _build_job_card_services(obj)

    def get_requiresStoreManagerApproval(self, obj):
        return _job_card_requires_store_manager_approval(obj)

    def get_hasOperationRegister(self, obj):
        return hasattr(obj, "operationRegister")

    def get_operationRegisterId(self, obj):
        operation_register = getattr(obj, "operationRegister", None)
        return operation_register.id if operation_register is not None else None


class OperationRegisterSerializer(serializers.ModelSerializer):
    jobCardId = serializers.PrimaryKeyRelatedField(
        queryset=JobCard.objects.select_related(
            "purchaseOrder",
            "purchaseOrder__quotation",
            "purchaseOrder__quotation__salesServiceRequest",
            "quotation",
            "quotation__salesServiceRequest",
        ),
        source="jobCard",
        write_only=True,
        required=False,
    )
    jobCardNo = serializers.CharField(source="jobCard.jobCardNo", read_only=True)
    grnNo = serializers.CharField(source="jobCard.grnNo", read_only=True)
    rfqNo = serializers.SerializerMethodField()
    rfqDate = serializers.SerializerMethodField()
    attentionName = serializers.SerializerMethodField()
    companyName = serializers.SerializerMethodField()
    purchaseOrderNo = serializers.SerializerMethodField()
    poDate = serializers.SerializerMethodField()
    planningType = serializers.SerializerMethodField()
    planningTypeLabel = serializers.SerializerMethodField()
    planStartDate = serializers.SerializerMethodField()
    planEndDate = serializers.SerializerMethodField()
    shopFloorInchargeLabel = serializers.SerializerMethodField()
    scopeDetails = serializers.SerializerMethodField()
    services = serializers.SerializerMethodField()

    class Meta:
        model = OperationRegister
        fields = (
            "id",
            "jobCardId",
            "jobCard",
            "jobCardNo",
            "grnNo",
            "operationNo",
            "opDate",
            "rfqNo",
            "rfqDate",
            "attentionName",
            "companyName",
            "purchaseOrderNo",
            "poDate",
            "planningType",
            "planningTypeLabel",
            "planStartDate",
            "planEndDate",
            "shopFloorIncharge",
            "shopFloorInchargeLabel",
            "scopeDetails",
            "services",
            "remarks",
            "assignedToSiteEngineer",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "jobCard",
            "jobCardNo",
            "grnNo",
            "operationNo",
            "opDate",
            "rfqNo",
            "rfqDate",
            "attentionName",
            "companyName",
            "purchaseOrderNo",
            "poDate",
            "planningType",
            "planningTypeLabel",
            "planStartDate",
            "planEndDate",
            "shopFloorInchargeLabel",
            "scopeDetails",
            "services",
            "assignedToSiteEngineer",
            "created_at",
            "updated_at",
        )

    def validate(self, attrs):
        job_card = attrs.get("jobCard")
        errors = {}

        if self.instance is not None:
            current_job_card = getattr(self.instance, "jobCard", None)
            if job_card is None:
                job_card = current_job_card
                attrs["jobCard"] = current_job_card
            elif current_job_card is not None and job_card.id != current_job_card.id:
                errors["jobCardId"] = "Job card cannot be changed for an existing operation register."

        if job_card is None:
            errors["jobCardId"] = "Select a job card."
        else:
            if not job_card.sentToHod:
                errors["jobCardId"] = "Operation register is available only after notifying HOD."
            elif (
                self.instance is None
                and hasattr(job_card, "operationRegister")
            ):
                errors["jobCardId"] = "An operation register already exists for the selected job card."

        if not str(attrs.get("shopFloorIncharge", getattr(self.instance, "shopFloorIncharge", "")) or "").strip():
            errors["shopFloorIncharge"] = "Select the shop floor incharge."

        if errors:
            raise serializers.ValidationError(errors)

        return attrs

    def _get_request_item(self, obj):
        return _get_job_card_source_request_item(getattr(obj, "jobCard", None))

    def _get_purchase_order(self, obj):
        return _get_job_card_source_purchase_order(getattr(obj, "jobCard", None))

    def _get_quotation(self, obj):
        return _get_job_card_source_quotation(getattr(obj, "jobCard", None))

    def get_rfqNo(self, obj):
        request_item = self._get_request_item(obj)
        return getattr(request_item, "referenceNo", "") or ""

    def get_rfqDate(self, obj):
        request_item = self._get_request_item(obj)
        request_date = getattr(request_item, "requestDate", None)
        return request_date.isoformat() if request_date else ""

    def get_attentionName(self, obj):
        quotation = self._get_quotation(obj)
        return getattr(quotation, "attentionName", "") or ""

    def get_companyName(self, obj):
        quotation = self._get_quotation(obj)
        return getattr(quotation, "companyName", "") or ""

    def get_purchaseOrderNo(self, obj):
        purchase_order = self._get_purchase_order(obj)
        return getattr(purchase_order, "purchaseOrderNo", "") or ""

    def get_poDate(self, obj):
        purchase_order = self._get_purchase_order(obj)
        po_date = getattr(purchase_order, "poDate", None)
        return po_date.isoformat() if po_date else ""

    def get_planningType(self, obj):
        request_item = self._get_request_item(obj)
        return getattr(request_item, "planningType", "") or ""

    def get_planningTypeLabel(self, obj):
        request_item = self._get_request_item(obj)
        if request_item is None:
            return ""
        return request_item.get_planningType_display() or ""

    def get_planStartDate(self, obj):
        request_item = self._get_request_item(obj)
        plan_start_date = getattr(request_item, "planStartDate", None)
        return plan_start_date.isoformat() if plan_start_date else ""

    def get_planEndDate(self, obj):
        request_item = self._get_request_item(obj)
        plan_end_date = getattr(request_item, "planEndDate", None)
        return plan_end_date.isoformat() if plan_end_date else ""

    def get_shopFloorInchargeLabel(self, obj):
        return obj.get_shopFloorIncharge_display() or ""

    def get_scopeDetails(self, obj):
        return _build_job_card_scope_lines(getattr(obj, "jobCard", None))

    def get_services(self, obj):
        return _build_job_card_services(getattr(obj, "jobCard", None))


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
    isReadOnly = serializers.SerializerMethodField()
    isQuoted = serializers.SerializerMethodField()
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
            "isReadOnly",
            "isQuoted",
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
            "isReadOnly",
            "isQuoted",
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

    def get_isReadOnly(self, obj):
        return obj.is_locked_for_editing()

    def get_isQuoted(self, obj):
        return obj.has_quotation()
    def validate_rows(self, value):
        if not value:
            raise serializers.ValidationError("Add at least one cost estimation row.")

        for row in value:
            if row["quantity"] <= 0:
                raise serializers.ValidationError("Each row quantity must be greater than 0.")
            if row["rate"] < 0:
                raise serializers.ValidationError("Each row rate must be 0 or greater.")

        return value

    def validate(self, attrs):
        sales_service_request = attrs.get(
            "salesServiceRequest",
            getattr(self.instance, "salesServiceRequest", None),
        )

        if self.instance and self.instance.is_locked_for_editing():
            raise serializers.ValidationError(
                {
                    "non_field_errors": [
                        "This cost estimation sheet is read only because it is already in approval or used in quotation."
                    ]
                }
            )

        if sales_service_request is None:
            return attrs

        if (
            sales_service_request.rfqCategory
            != SalesServiceRequest.RFQ_CATEGORY_STANDARD
        ):
            raise serializers.ValidationError(
                {
                    "salesServiceRequestId": [
                        "Cost estimation is available only for standard RFQs."
                    ]
                }
            )

        existing_sheets = CostEstimationSheet.objects.filter(
            salesServiceRequest=sales_service_request,
        )
        if self.instance is None:
            if existing_sheets.exists():
                raise serializers.ValidationError(
                    {
                        "salesServiceRequestId": [
                            "A cost estimation sheet already exists for this RFQ. Update the existing sheet instead."
                        ]
                    }
                )
        elif sales_service_request.id != self.instance.salesServiceRequest_id:
            if existing_sheets.exclude(id=self.instance.id).exists():
                raise serializers.ValidationError(
                    {
                        "salesServiceRequestId": [
                            "A cost estimation sheet already exists for this RFQ. Update the existing sheet instead."
                        ]
                    }
                )

        return attrs
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
