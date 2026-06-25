import base64
import json
import re
from datetime import date, timedelta
from functools import lru_cache
from io import BytesIO
from pathlib import Path

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.contrib.auth.models import Group
from django.core import signing
from django.db import transaction
from django.db.models import Prefetch, Q, Sum
from django.db.models.deletion import ProtectedError
from django.http import HttpResponse
from django.shortcuts import get_object_or_404, render
from django.template.loader import render_to_string
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from xhtml2pdf import pisa

from .models import (
    CostEstimationRate,
    CostEstimationSheet,
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
from .serializers import (
    CostEstimationRateSerializer,
    CostEstimationSheetSerializer,
    DispatchSummarySerializer,
    ItemFolderSerializer,
    ItemSerializer,
    JobCardSerializer,
    OperationRegisterSerializer,
    PurchaseOrderSerializer,
    QuotationSerializer,
    SalesServiceRequestSerializer,
)


COMPANY_DETAILS = {
    "name": "TK POWER SOURCE",
    "gstin": "33AACFV3825E2ZG",
    "phone": "9344001577",
    "email": "tkpowersource@gmail.com",
    "address": "72C Thanneerpanthal Colony, Annuparpalayam P.O, Tiruppur",
}

DEFAULT_CURRENCY = {
    "name": "India",
    "code": "INR",
    "symbol": "\u20b9",
    "rateToInr": 1.0,
    "amountLabel": "Rupees",
    "precision": 2,
}

CURRENCIES_BY_CODE = {
    "INR": DEFAULT_CURRENCY,
    "USD": {
        "name": "USA",
        "code": "USD",
        "symbol": "$",
        "rateToInr": 91.357,
        "amountLabel": "Dollars",
        "precision": 2,
    },
    "EUR": {
        "name": "Eurozone",
        "code": "EUR",
        "symbol": "\u20ac",
        "rateToInr": 106.223309,
        "amountLabel": "Euros",
        "precision": 2,
    },
    "GBP": {
        "name": "UK",
        "code": "GBP",
        "symbol": "\u00a3",
        "rateToInr": 122.847125,
        "amountLabel": "Pounds",
        "precision": 2,
    },
    "OMR": {
        "name": "Oman",
        "code": "OMR",
        "symbol": "OMR",
        "rateToInr": 213.57,
        "amountLabel": "Rials",
        "precision": 3,
    },
}

ADMIN_AUTH_SALT = "employees.admin-auth"
ADMIN_AUTH_COOKIE_NAME = "admin_auth_token"
ROLE_ADMIN = "admin"
ROLE_SALES_EXECUTIVE = "sales_executive"
ROLE_LEAD_SALES = "lead_sales"
ROLE_HOD = "hod"
ROLE_MD = "md"
ROLE_DOCUMENT_CONTROLLER = "document_controller"
ROLE_OPERATION_HEAD = "operation_head"
ROLE_SITE_ENGINEER = "site_engineer"
WORKFLOW_ROLE_ORDER = (
    ROLE_ADMIN,
    ROLE_SALES_EXECUTIVE,
    ROLE_LEAD_SALES,
    ROLE_HOD,
    ROLE_MD,
    ROLE_DOCUMENT_CONTROLLER,
    ROLE_OPERATION_HEAD,
    ROLE_SITE_ENGINEER,
)
WORKFLOW_GROUP_ROLES = (
    ROLE_SALES_EXECUTIVE,
    ROLE_LEAD_SALES,
    ROLE_HOD,
    ROLE_MD,
    ROLE_DOCUMENT_CONTROLLER,
    ROLE_OPERATION_HEAD,
    ROLE_SITE_ENGINEER,
)
PURCHASE_ORDER_ALLOWED_ROLES = (
    ROLE_LEAD_SALES,
    ROLE_DOCUMENT_CONTROLLER,
    ROLE_OPERATION_HEAD,
)
JOB_CARD_ALLOWED_ROLES = (
    ROLE_LEAD_SALES,
    ROLE_DOCUMENT_CONTROLLER,
    ROLE_OPERATION_HEAD,
    ROLE_SITE_ENGINEER,
)
ITEMFOLDER_FIELDS = (
    "itemCode",
    "unit",
    "mrp",
    "itemType",
    "hsnCode",
    "purchasePrice",
    "itemName",
    "tax",
    "salesPrice",
    "categoryName",
    "partNo",
    "minimumOrderQty",
    "itemGroup",
    "batchNo",
    "minimumStockQty",
    "itemDescription",
    "isStock",
    "needQc",
    "needWarranty",
    "isActive",
    "needService",
    "needSerialNo",
    "itemImage",
)
ITEM_CODE_PREFIX = "BA-A01-"
ITEM_CODE_PATTERN = re.compile(r"^BA-A01-(\d{4})$")
RFQ_REFERENCE_PATTERN = re.compile(r"^RF-(\d{2})-(\d{4})$")
COST_ESTIMATION_NUMBER_PATTERN = re.compile(r"^CST-(\d{2})-(\d{4})$")
QUOTATION_NUMBER_PATTERN = re.compile(r"^QUOTE-(\d{2})-(\d{4})$")
PURCHASE_ORDER_NUMBER_PATTERN = re.compile(r"^PO-(\d{2})-(\d{4})$")
JOB_CARD_NUMBER_PATTERN = re.compile(r"^JOB-CARD-(\d{4})$")
GRN_NUMBER_PATTERN = re.compile(r"^GRN-(\d{4})$")
OPERATION_NUMBER_PATTERN = re.compile(r"^OP-(\d{4})$")
COST_ESTIMATION_SECTION_ORDER = (
    "raw_material",
    "manufacturing",
    "labor",
    "testing",
    "packaging",
    "overhead",
)
SALES_SERVICE_PARSER_CLASSES = (MultiPartParser, FormParser, JSONParser)
SALES_SERVICE_JSON_FIELDS = ("batteryServices", "manufacturingItems")


def _read(source, key, default=""):
    if isinstance(source, dict):
        return source.get(key, default)
    return getattr(source, key, default)


def _ensure_workflow_groups():
    for role_name in WORKFLOW_GROUP_ROLES:
        Group.objects.get_or_create(name=role_name)


def _ensure_default_admin():
    User = get_user_model()

    if User.objects.filter(is_superuser=True).exists():
        return

    default_username = getattr(settings, "DEFAULT_ADMIN_USERNAME", "admin")
    if User.objects.filter(username=default_username).exists():
        return

    User.objects.create_superuser(
        username=default_username,
        email=getattr(settings, "DEFAULT_ADMIN_EMAIL", "admin@example.com"),
        password=getattr(settings, "DEFAULT_ADMIN_PASSWORD", "Admin@123"),
    )


def _ensure_default_workflow_users():
    _ensure_workflow_groups()
    User = get_user_model()
    role_defaults = (
        (
            ROLE_SALES_EXECUTIVE,
            getattr(settings, "DEFAULT_SALES_EXECUTIVE_USERNAME", "salesexec"),
            getattr(settings, "DEFAULT_SALES_EXECUTIVE_PASSWORD", "SalesExec@123"),
            getattr(settings, "DEFAULT_SALES_EXECUTIVE_EMAIL", "salesexec@example.com"),
        ),
        (
            ROLE_LEAD_SALES,
            getattr(settings, "DEFAULT_LEAD_SALES_USERNAME", "leadsales"),
            getattr(settings, "DEFAULT_LEAD_SALES_PASSWORD", "LeadSales@123"),
            getattr(settings, "DEFAULT_LEAD_SALES_EMAIL", "leadsales@example.com"),
        ),
        (
            ROLE_HOD,
            getattr(settings, "DEFAULT_HOD_USERNAME", "hod"),
            getattr(settings, "DEFAULT_HOD_PASSWORD", "Hod@12345"),
            getattr(settings, "DEFAULT_HOD_EMAIL", "hod@example.com"),
        ),
        (
            ROLE_MD,
            getattr(settings, "DEFAULT_MD_USERNAME", "md"),
            getattr(settings, "DEFAULT_MD_PASSWORD", "Md@12345"),
            getattr(settings, "DEFAULT_MD_EMAIL", "md@example.com"),
        ),
        (
            ROLE_DOCUMENT_CONTROLLER,
            getattr(
                settings,
                "DEFAULT_DOCUMENT_CONTROLLER_USERNAME",
                "documentcontroller",
            ),
            getattr(
                settings,
                "DEFAULT_DOCUMENT_CONTROLLER_PASSWORD",
                "DocumentController@123",
            ),
            getattr(
                settings,
                "DEFAULT_DOCUMENT_CONTROLLER_EMAIL",
                "documentcontroller@example.com",
            ),
        ),
        (
            ROLE_OPERATION_HEAD,
            getattr(settings, "DEFAULT_OPERATION_HEAD_USERNAME", "storemanager"),
            getattr(settings, "DEFAULT_OPERATION_HEAD_PASSWORD", "StoreManager@123"),
            getattr(settings, "DEFAULT_OPERATION_HEAD_EMAIL", "storemanager@example.com"),
        ),
        (
            ROLE_SITE_ENGINEER,
            getattr(settings, "DEFAULT_SITE_ENGINEER_USERNAME", "siteengineer"),
            getattr(settings, "DEFAULT_SITE_ENGINEER_PASSWORD", "SiteEngineer@123"),
            getattr(settings, "DEFAULT_SITE_ENGINEER_EMAIL", "siteengineer@example.com"),
        ),
    )

    for role_name, username, password, email in role_defaults:
        username = str(username or "").strip()
        if not username:
            continue

        group = Group.objects.get(name=role_name)
        existing_role_user = User.objects.filter(groups=group).first()
        if existing_role_user is not None:
            continue

        user = User.objects.filter(username=username).first()
        if user is None:
            user = User.objects.create_user(
                username=username,
                email=email,
                password=password,
            )

        user.groups.add(group)


def _get_user_roles(user):
    if not user or not user.is_active:
        return []

    roles = []
    if user.is_staff or user.is_superuser:
        roles.append(ROLE_ADMIN)

    user_group_roles = set(
        user.groups.filter(name__in=WORKFLOW_GROUP_ROLES).values_list("name", flat=True)
    )
    roles.extend(
        role_name
        for role_name in WORKFLOW_ROLE_ORDER
        if role_name != ROLE_ADMIN and role_name in user_group_roles
    )
    return roles


def _is_authorized_workflow_user(user):
    return bool(_get_user_roles(user))


def _build_admin_user_payload(user):
    roles = _get_user_roles(user)
    return {
        "id": user.id,
        "username": user.get_username(),
        "isStaff": user.is_staff,
        "isSuperuser": user.is_superuser,
        "isActive": user.is_active,
        "roles": roles,
        "primaryRole": roles[0] if roles else "",
    }


def _build_admin_auth_payload(user):
    user_payload = _build_admin_user_payload(user)

    return {
        "authenticated": True,
        "token": signing.dumps(user_payload, salt=ADMIN_AUTH_SALT),
        "user": user_payload,
    }


def _decode_admin_token(token):
    return signing.loads(
        token,
        salt=ADMIN_AUTH_SALT,
        max_age=getattr(settings, "ADMIN_AUTH_MAX_AGE", 43200),
    )


def _extract_admin_token_from_request(request):
    authorization_header = str(request.headers.get("Authorization", "") or "").strip()
    if authorization_header.lower().startswith("bearer "):
        return authorization_header[7:].strip()

    explicit_header = str(request.headers.get("X-Admin-Token", "") or "").strip()
    if explicit_header:
        return explicit_header

    return str(request.COOKIES.get(ADMIN_AUTH_COOKIE_NAME, "") or "").strip()


def _unauthorized_response(message="Authentication is required."):
    return Response({"error": message}, status=status.HTTP_401_UNAUTHORIZED)


def _forbidden_response(message="You do not have permission to access this resource."):
    return Response({"error": message}, status=status.HTTP_403_FORBIDDEN)


def _authenticate_request(request):
    token = _extract_admin_token_from_request(request)
    if not token:
        return None, None, _unauthorized_response()

    try:
        token_data = _decode_admin_token(token)
    except signing.BadSignature:
        return None, None, _unauthorized_response("Invalid or expired auth token.")

    user = get_user_model().objects.filter(id=token_data.get("id")).first()
    if (
        not _is_authorized_workflow_user(user)
        or user.get_username() != token_data.get("username")
    ):
        return None, None, _unauthorized_response("Access is no longer valid.")

    roles = _get_user_roles(user)
    request.workflow_user = user
    request.workflow_roles = roles
    return user, roles, None


def _authorize_request(request, *allowed_roles, message=None):
    user, roles, error_response = _authenticate_request(request)
    if error_response is not None:
        return None, None, error_response

    if not allowed_roles:
        return user, roles, None

    if ROLE_ADMIN in roles or any(role_name in roles for role_name in allowed_roles):
        return user, roles, None

    return None, roles, _forbidden_response(
        message or "You do not have permission to perform this action."
    )


def _to_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _to_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _split_non_empty_lines(value):
    return [line.strip() for line in str(value or "").splitlines() if line.strip()]


def _parse_itemfolder_section(value):
    if isinstance(value, dict):
        return value

    if isinstance(value, str):
        raw_value = value.strip()
        if not raw_value:
            return {}
        try:
            parsed_value = json.loads(raw_value)
        except json.JSONDecodeError:
            return {}
        return parsed_value if isinstance(parsed_value, dict) else {}

    return {}


def _extract_itemfolder_payload(data):
    payload = {}
    payload.update(_parse_itemfolder_section(_read(data, "formValues", {})))
    payload.update(_parse_itemfolder_section(_read(data, "toggles", {})))

    for field_name in ITEMFOLDER_FIELDS:
        try:
            has_field = field_name in data
        except TypeError:
            has_field = False

        if has_field:
            payload[field_name] = data.get(field_name)

    return payload


def _parse_json_like(value, expected_type, default):
    if isinstance(value, expected_type):
        return value

    if isinstance(value, str):
        raw_value = value.strip()
        if not raw_value:
            return default
        try:
            parsed_value = json.loads(raw_value)
        except json.JSONDecodeError:
            return default
        return parsed_value if isinstance(parsed_value, expected_type) else default

    return default


def _copy_request_payload(request, file_field_names=()):
    request_data = request.data
    payload = {}
    file_field_names = set(file_field_names)

    if hasattr(request_data, "lists"):
        for key, values in request_data.lists():
            if key in file_field_names:
                continue
            if not values:
                payload[key] = ""
                continue
            payload[key] = values[-1] if len(values) == 1 else values
    elif hasattr(request_data, "items"):
        payload = {
            key: value
            for key, value in request_data.items()
            if key not in file_field_names
        }
    else:
        payload = {
            key: value
            for key, value in dict(request_data).items()
            if key not in file_field_names
        }

    for field_name in file_field_names:
        uploaded_file = request.FILES.get(field_name)
        if uploaded_file is not None:
            payload[field_name] = uploaded_file
            continue

        raw_value = payload.get(field_name)
        if raw_value in ("", None, "null", "undefined"):
            payload.pop(field_name, None)

    return payload

def _normalise_sales_service_payload(payload):
    for field_name in SALES_SERVICE_JSON_FIELDS:
        if field_name in payload:
            payload[field_name] = _parse_json_like(payload.get(field_name), list, [])

    for field_name in (
        "modeOfContact",
        "requestType",
        "rfqType",
        "rfqCategory",
        "salesExecutive",
    ):
        if field_name in payload:
            payload[field_name] = str(payload.get(field_name) or "").strip().lower()

    return payload
def _generate_next_itemfolder_code():
    highest_suffix = 0
    existing_codes = ItemFolder.objects.filter(itemCode__startswith=ITEM_CODE_PREFIX).values_list(
        "itemCode",
        flat=True,
    )

    for item_code in existing_codes:
        match = ITEM_CODE_PATTERN.match(str(item_code or "").strip())
        if not match:
            continue

        highest_suffix = max(highest_suffix, int(match.group(1)))

    return f"{ITEM_CODE_PREFIX}{highest_suffix + 1:04d}"


def _parse_iso_date(value):
    if isinstance(value, date):
        return value

    raw_value = str(value or "").strip()
    if not raw_value:
        return None

    try:
        return date.fromisoformat(raw_value)
    except ValueError:
        return None


def _generate_next_sales_service_reference(request_date=None):
    reference_date = request_date or date.today()
    year_suffix = reference_date.strftime("%y")
    reference_prefix = f"RF-{year_suffix}-"
    highest_suffix = 0
    existing_references = SalesServiceRequest.objects.filter(
        referenceNo__startswith=reference_prefix,
    ).values_list("referenceNo", flat=True)

    for reference_no in existing_references:
        match = RFQ_REFERENCE_PATTERN.match(str(reference_no or "").strip())
        if not match or match.group(1) != year_suffix:
            continue

        highest_suffix = max(highest_suffix, int(match.group(2)))

    return f"{reference_prefix}{highest_suffix + 1:04d}"


def _resolve_cost_estimation_reference_date(request_date_value=None, sales_service_request_id=None):
    parsed_date = _parse_iso_date(request_date_value)
    if parsed_date is not None:
        return parsed_date

    request_id = _to_int(sales_service_request_id, None)
    if request_id is not None and request_id > 0:
        request_date = (
            SalesServiceRequest.objects.filter(id=request_id)
            .values_list("requestDate", flat=True)
            .first()
        )
        if request_date is not None:
            return request_date

    return date.today()


def _generate_next_cost_estimation_number(reference_date=None):
    estimation_date = reference_date or date.today()
    year_suffix = estimation_date.strftime("%y")
    estimation_prefix = f"CST-{year_suffix}-"
    highest_suffix = 0
    existing_numbers = CostEstimationSheet.objects.filter(
        costEstimationNo__startswith=estimation_prefix,
    ).values_list("costEstimationNo", flat=True)

    for cost_estimation_no in existing_numbers:
        match = COST_ESTIMATION_NUMBER_PATTERN.match(str(cost_estimation_no or "").strip())
        if not match or match.group(1) != year_suffix:
            continue

        highest_suffix = max(highest_suffix, int(match.group(2)))

    return f"{estimation_prefix}{highest_suffix + 1:04d}"

def _generate_next_quotation_number(reference_date=None):
    quotation_date = reference_date or date.today()
    year_suffix = quotation_date.strftime("%y")
    quotation_prefix = f"QUOTE-{year_suffix}-"
    highest_suffix = 0
    existing_numbers = Quotation.objects.filter(
        quotationCode__startswith=quotation_prefix,
    ).values_list("quotationCode", flat=True)

    for quotation_code in existing_numbers:
        match = QUOTATION_NUMBER_PATTERN.match(str(quotation_code or "").strip())
        if not match or match.group(1) != year_suffix:
            continue

        highest_suffix = max(highest_suffix, int(match.group(2)))

    return f"{quotation_prefix}{highest_suffix + 1:04d}"


def _generate_next_purchase_order_number(reference_date=None):
    purchase_order_date = reference_date or date.today()
    year_suffix = purchase_order_date.strftime("%y")
    purchase_order_prefix = f"PO-{year_suffix}-"
    highest_suffix = 0
    existing_numbers = PurchaseOrder.objects.filter(
        purchaseOrderNo__startswith=purchase_order_prefix,
    ).values_list("purchaseOrderNo", flat=True)

    for purchase_order_no in existing_numbers:
        match = PURCHASE_ORDER_NUMBER_PATTERN.match(str(purchase_order_no or "").strip())
        if not match or match.group(1) != year_suffix:
            continue

        highest_suffix = max(highest_suffix, int(match.group(2)))

    return f"{purchase_order_prefix}{highest_suffix + 1:04d}"


def _generate_next_job_card_number():
    highest_suffix = 0
    existing_numbers = JobCard.objects.values_list("jobCardNo", flat=True)

    for job_card_no in existing_numbers:
        match = JOB_CARD_NUMBER_PATTERN.match(str(job_card_no or "").strip())
        if not match:
            continue

        highest_suffix = max(highest_suffix, int(match.group(1)))

    return f"JOB-CARD-{highest_suffix + 1:04d}"


def _generate_next_grn_number():
    highest_suffix = 0
    existing_numbers = JobCard.objects.exclude(grnNo="").values_list("grnNo", flat=True)

    for grn_no in existing_numbers:
        match = GRN_NUMBER_PATTERN.match(str(grn_no or "").strip())
        if not match:
            continue

        highest_suffix = max(highest_suffix, int(match.group(1)))

    return f"GRN-{highest_suffix + 1:04d}"


def _generate_next_operation_number():
    highest_suffix = 0
    existing_numbers = OperationRegister.objects.values_list("operationNo", flat=True)

    for operation_no in existing_numbers:
        match = OPERATION_NUMBER_PATTERN.match(str(operation_no or "").strip())
        if not match:
            continue

        highest_suffix = max(highest_suffix, int(match.group(1)))

    return f"OP-{highest_suffix + 1:04d}"


def _deduplicate_labels(values):
    unique_values = []
    for value in values:
        label = str(value or "").strip()
        if label and label not in unique_values:
            unique_values.append(label)
    return unique_values


def _build_job_card_material_line(item_name="", quantity=None, unit=""):
    parts = [str(item_name or "").strip()]

    if quantity not in ("", None, 0, "0"):
        parts.append(str(quantity).strip())

    unit_value = str(unit or "").strip()
    if unit_value:
        parts.append(unit_value)

    return " ".join(part for part in parts if part).strip()


def _get_job_card_source_purchase_order(source):
    if isinstance(source, PurchaseOrder):
        return source
    if isinstance(source, JobCard):
        return getattr(source, "purchaseOrder", None)
    return None


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

    latest_sheet = (
        request_item.costEstimationSheets.order_by("-created_at", "-id").first()
    )
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

        line = _build_job_card_material_line(row.itemName, row.quantity, row.unit)
        if line:
            lines.append(line)

    return _deduplicate_labels(lines)


def _build_job_card_scope_details(source):
    quotation = _get_job_card_source_quotation(source)
    request_item = _get_job_card_source_request_item(source)
    scope_details = []

    if isinstance(getattr(quotation, "rfqScope", None), list):
        scope_details.extend(quotation.rfqScope)
    elif isinstance(getattr(quotation, "scopeDetails", None), list):
        scope_details.extend(quotation.scopeDetails)

    if request_item is not None and not scope_details:
        scope_details.extend(_split_non_empty_lines(getattr(request_item, "scopeArea", "")))
        scope_details.extend(getattr(request_item, "batteryServices", []) or [])

    excluded_lines = set(
        _build_job_card_materials(source) + _build_job_card_services(source)
    )

    return [
        line
        for line in _deduplicate_labels(scope_details)
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

        material_line = _build_job_card_material_line(
            manufacturing_item.get("itemName"),
            manufacturing_item.get("quantity"),
            manufacturing_item.get("unit"),
        )
        if material_line:
            materials.append(material_line)

    if not materials:
        fallback_line = _build_job_card_material_line(
            getattr(request_item, "itemName", ""),
            getattr(request_item, "quantity", None),
            getattr(request_item, "unit", ""),
        )
        if fallback_line:
            materials.append(fallback_line)

    return _deduplicate_labels(materials)


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

    return _deduplicate_labels(services)


def _job_card_requires_store_manager_approval(source):
    request_item = _get_job_card_source_request_item(source)
    return (
        request_item is not None
        and getattr(request_item, "rfqType", "") == SalesServiceRequest.RFQ_TYPE_WORKSHOP
    )


def _build_job_card_opening_payload(source, job_card=None):
    purchase_order = _get_job_card_source_purchase_order(source)
    quotation = _get_job_card_source_quotation(source)
    request_item = _get_job_card_source_request_item(source)
    today_value = date.today().isoformat()
    source_id = getattr(source, "id", None)
    planning_default_date = (
        purchase_order.poReceivedDate.isoformat()
        if purchase_order is not None and purchase_order.poReceivedDate
        else today_value
    )
    expected_default_date = (
        purchase_order.expectedDate.isoformat()
        if purchase_order is not None and purchase_order.expectedDate
        else (
            request_item.requiredDeliveryDate.isoformat()
            if getattr(request_item, "requiredDeliveryDate", None)
            else ""
        )
    )

    return {
        "sourceType": "purchase_order" if purchase_order is not None else "quotation",
        "purchaseOrderId": purchase_order.id if purchase_order is not None else None,
        "quotationId": getattr(quotation, "id", None) or source_id,
        "purchaseOrderNo": getattr(purchase_order, "purchaseOrderNo", "") or "",
        "poDate": purchase_order.poDate.isoformat() if purchase_order is not None and purchase_order.poDate else "",
        "quotationCode": getattr(quotation, "quotationCode", "") or "",
        "costEstimationNo": getattr(quotation, "costEstimationNo", "") or "",
        "rfqNo": getattr(request_item, "referenceNo", "") or "",
        "rfqDate": (
            request_item.requestDate.isoformat()
            if request_item is not None and getattr(request_item, "requestDate", None)
            else ""
        ),
        "rfqType": getattr(request_item, "rfqType", "") or "",
        "rfqTypeLabel": request_item.get_rfqType_display() if request_item is not None else "",
        "rfqCategory": getattr(request_item, "rfqCategory", "") or "",
        "rfqCategoryLabel": (
            request_item.get_rfqCategory_display() if request_item is not None else ""
        ),
        "planningType": getattr(request_item, "planningType", "") or "",
        "planningTypeLabel": (
            request_item.get_planningType_display() if request_item is not None else ""
        ),
        "planStartDate": (
            request_item.planStartDate.isoformat()
            if request_item is not None and getattr(request_item, "planStartDate", None)
            else ""
        ),
        "planEndDate": (
            request_item.planEndDate.isoformat()
            if request_item is not None and getattr(request_item, "planEndDate", None)
            else ""
        ),
        "attentionName": getattr(quotation, "attentionName", "") or "",
        "companyName": getattr(quotation, "companyName", "") or "",
        "scopeDetails": _build_job_card_scope_details(source),
        "materials": _build_job_card_materials(source),
        "services": _build_job_card_services(source),
        "requiresStoreManagerApproval": _job_card_requires_store_manager_approval(source),
        "jobCardId": getattr(job_card, "id", None),
        "jobCardNo": (
            getattr(job_card, "jobCardNo", "") or _generate_next_job_card_number()
        ),
        "grnNo": getattr(job_card, "grnNo", "") or "",
        "sentToStoreManager": bool(getattr(job_card, "sentToStoreManager", False)),
        "jobCardDate": (
            job_card.jobCardDate.isoformat()
            if getattr(job_card, "jobCardDate", None)
            else today_value
        ),
        "planningDate": (
            job_card.planningDate.isoformat()
            if getattr(job_card, "planningDate", None)
            else (
                request_item.planStartDate.isoformat()
                if getattr(request_item, "planStartDate", None)
                else planning_default_date
            )
        ),
        "expectedDate": (
            job_card.expectedDate.isoformat()
            if getattr(job_card, "expectedDate", None)
            else expected_default_date
        ),
        "remarks": (
            getattr(job_card, "remarks", "")
            or getattr(request_item, "planningRemarks", "")
            or getattr(quotation, "rfqRemarks", "")
            or ""
        ),
        "deliveryRemark": getattr(job_card, "deliveryRemark", "") or "",
    }


def _build_operation_register_opening_payload(job_card, operation_register=None):
    request_item = _get_job_card_source_request_item(job_card)
    purchase_order = _get_job_card_source_purchase_order(job_card)
    quotation = _get_job_card_source_quotation(job_card)
    today_value = date.today().isoformat()

    return {
        "operationRegisterId": getattr(operation_register, "id", None),
        "jobCardId": getattr(job_card, "id", None),
        "jobCardNo": getattr(job_card, "jobCardNo", "") or "",
        "grnNo": getattr(job_card, "grnNo", "") or "",
        "operationNo": (
            getattr(operation_register, "operationNo", "") or _generate_next_operation_number()
        ),
        "opDate": (
            operation_register.opDate.isoformat()
            if getattr(operation_register, "opDate", None)
            else today_value
        ),
        "rfqNo": getattr(request_item, "referenceNo", "") or "",
        "rfqDate": (
            request_item.requestDate.isoformat()
            if request_item is not None and getattr(request_item, "requestDate", None)
            else ""
        ),
        "attentionName": getattr(quotation, "attentionName", "") or "",
        "companyName": getattr(quotation, "companyName", "") or "",
        "purchaseOrderNo": getattr(purchase_order, "purchaseOrderNo", "") or "",
        "poDate": (
            purchase_order.poDate.isoformat()
            if purchase_order is not None and getattr(purchase_order, "poDate", None)
            else ""
        ),
        "quotationCode": getattr(quotation, "quotationCode", "") or "",
        "quotationDate": (
            quotation.quotationDate.isoformat()
            if quotation is not None and getattr(quotation, "quotationDate", None)
            else ""
        ),
        "planningType": getattr(request_item, "planningType", "") or "",
        "planningTypeLabel": (
            request_item.get_planningType_display() if request_item is not None else ""
        ),
        "planStartDate": (
            request_item.planStartDate.isoformat()
            if request_item is not None and getattr(request_item, "planStartDate", None)
            else ""
        ),
        "planEndDate": (
            request_item.planEndDate.isoformat()
            if request_item is not None and getattr(request_item, "planEndDate", None)
            else ""
        ),
        "scopeDetails": _build_job_card_scope_details(job_card),
        "materials": _build_job_card_materials(job_card),
        "services": _build_job_card_services(job_card),
        "shopFloorIncharge": getattr(operation_register, "shopFloorIncharge", "") or "",
        "remarks": getattr(operation_register, "remarks", "") or "",
        "assignedToSiteEngineer": bool(
            getattr(operation_register, "assignedToSiteEngineer", False)
        ),
    }


def _get_next_quotation_revision(sales_service_request_id):
    latest_revision = (
        Quotation.objects.filter(salesServiceRequest_id=sales_service_request_id)
        .order_by("-revisedNo", "-id")
        .values_list("revisedNo", flat=True)
        .first()
    )
    return int(latest_revision or 0) + 1 if latest_revision is not None else 0


def _get_latest_approved_cost_estimation(request_item):
    if request_item is None:
        return None

    latest_sheet = next(iter(request_item.costEstimationSheets.all()), None)
    if (
        latest_sheet is not None
        and latest_sheet.get_overall_status() == CostEstimationSheet.APPROVAL_APPROVED
    ):
        return latest_sheet
    return None


def _build_scope_details_for_quotation(request_item):
    scope_details = [
        line.strip()
        for line in str(getattr(request_item, "scopeArea", "") or "").splitlines()
        if line.strip()
    ]

    if not scope_details:
        for battery_service in getattr(request_item, "batteryServices", []) or []:
            service_label = str(battery_service or "").strip()
            if service_label:
                scope_details.append(service_label)

    if not scope_details:
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
                scope_details.append(label)

    if not scope_details:
        parts = [
            str(getattr(request_item, "itemName", "") or "").strip(),
            str(getattr(request_item, "quantity", "") or "").strip(),
            str(getattr(request_item, "unit", "") or "").strip(),
        ]
        label = " ".join(part for part in parts if part).strip()
        if label:
            scope_details.append(label)

    unique_scope_details = []
    for scope_detail in scope_details:
        if scope_detail and scope_detail not in unique_scope_details:
            unique_scope_details.append(scope_detail)

    return unique_scope_details


def _uses_direct_rfq_workflow(request_item):
    if request_item is None:
        return False

    return request_item.rfqCategory in {
        SalesServiceRequest.RFQ_CATEGORY_QUOTE_OF_ASSESSMENT,
        SalesServiceRequest.RFQ_CATEGORY_QUOTE_OF_COMPLETION,
    }


def _rfq_requires_special_approval(request_item):
    return (
        request_item is not None
        and request_item.rfqCategory
        == SalesServiceRequest.RFQ_CATEGORY_QUOTE_OF_COMPLETION
    )


def _build_special_quotation_cost_breakdown():
    return {
        "rawMaterialTotal": 0,
        "processTotal": 0,
        "laborTotal": 0,
        "testingTotal": 0,
        "packagingTotal": 0,
        "overheadTotal": 0,
        "miscellaneousTotal": 0,
        "subtotal": 0,
        "taxPercentage": 0,
        "taxAmount": 0,
        "profitMarginPercentage": 0,
        "profitMarginAmount": 0,
        "finalBatteryCost": 0,
        "costPerUnit": 0,
    }


def _create_special_workflow_quotation(request_item):
    quotation_date = getattr(request_item, "requestDate", None) or date.today()
    requires_approval = _rfq_requires_special_approval(request_item)
    scope_details = _build_scope_details_for_quotation(request_item)
    approval_comment = (
        f"Auto-approved from RFQ {request_item.get_rfqCategory_display().lower()}."
        if request_item is not None
        else "Auto-approved from special RFQ."
    )

    return Quotation.objects.create(
        salesServiceRequest=request_item,
        costEstimationSheet=None,
        quotationCode=_generate_next_quotation_number(quotation_date),
        quotationDate=quotation_date,
        expiryDate=quotation_date,
        quoteValidityDays=0,
        revisedNo=_get_next_quotation_revision(request_item.id),
        attentionName=str(getattr(request_item, "clientName", "") or "").strip(),
        companyName=str(getattr(request_item, "companyName", "") or "").strip(),
        referenceNo=str(getattr(request_item, "referenceNo", "") or "").strip(),
        costEstimationNo="",
        scopeDetails=scope_details,
        rfqScope=scope_details,
        rfqRemarks=str(getattr(request_item, "planningRemarks", "") or "").strip(),
        rfqContactMode=str(getattr(request_item, "modeOfContact", "") or "").strip(),
        costBreakdown=_build_special_quotation_cost_breakdown(),
        totalCost=0,
        paymentTermsType="100% Advance",
        paymentTerms="",
        deliveryTermsType="",
        deliveryTerms="",
        termsType="",
        terms="",
        sentToHead=True,
        hodStatus=(
            Quotation.APPROVAL_PENDING
            if requires_approval
            else Quotation.APPROVAL_APPROVED
        ),
        hodComment="" if requires_approval else approval_comment,
        mdStatus=(
            Quotation.APPROVAL_PENDING
            if requires_approval
            else Quotation.APPROVAL_APPROVED
        ),
        mdComment="" if requires_approval else approval_comment,
        clientStatus=Quotation.CLIENT_STATUS_PENDING,
        clientComment="",
        currencyName=DEFAULT_CURRENCY["name"],
        currencyCode=DEFAULT_CURRENCY["code"],
        currencySymbol=DEFAULT_CURRENCY["symbol"],
        currencyRateToInr=DEFAULT_CURRENCY["rateToInr"],
        currencyAmountLabel=DEFAULT_CURRENCY["amountLabel"],
    )


def _ensure_special_rfq_workflow_records(request_item):
    if request_item is None or not _uses_direct_rfq_workflow(request_item):
        return None

    existing_quotation = (
        request_item.quotations.select_related("jobCard", "purchaseOrder")
        .order_by("-created_at", "-id")
        .first()
    )
    if existing_quotation is not None:
        return existing_quotation

    return _create_special_workflow_quotation(request_item)


def _get_quotation_queryset(workflow=None, planning_type=None):
    workflow_name = str(workflow or "").strip().lower()
    planning_type_name = str(planning_type or "").strip().lower()
    queryset = Quotation.objects.select_related(
        "salesServiceRequest",
        "costEstimationSheet",
        "purchaseOrder",
        "jobCard",
    )

    if workflow_name == "hod":
        queryset = queryset.filter(
            sentToHead=True,
            hodStatus=Quotation.APPROVAL_PENDING,
        )
    elif workflow_name == "md":
        queryset = queryset.filter(
            sentToHead=True,
            hodStatus=Quotation.APPROVAL_APPROVED,
            mdStatus=Quotation.APPROVAL_PENDING,
        )

    if workflow_name in {"hod", "md"}:
        if planning_type_name:
            queryset = queryset.filter(salesServiceRequest__planningType=planning_type_name)
        else:
            queryset = queryset.exclude(
                salesServiceRequest__planningType=SalesServiceRequest.PLANNING_TYPE_QUOTE_AFTER,
            )
    elif planning_type_name:
        queryset = queryset.filter(salesServiceRequest__planningType=planning_type_name)

    return queryset.order_by("-created_at", "-id")


def _build_purchase_order_catalog_row(quotation):
    return {
        "id": quotation.id,
        "quotationCode": quotation.quotationCode,
        "attentionName": quotation.attentionName,
        "companyName": quotation.companyName,
        "referenceNo": quotation.referenceNo,
        "costEstimationNo": quotation.costEstimationNo,
    }


def _build_job_card_queue_row_from_purchase_order(purchase_order, request=None):
    quotation = getattr(purchase_order, "quotation", None)
    request_item = getattr(quotation, "salesServiceRequest", None)
    job_card = getattr(purchase_order, "jobCard", None)

    file_url = getattr(getattr(purchase_order, "poReference", None), "url", "") or ""
    if file_url and request is not None:
        file_url = request.build_absolute_uri(file_url)

    return {
        "queueKey": f"purchase-order-{purchase_order.id}",
        "queueType": "purchase_order",
        "id": purchase_order.id,
        "purchaseOrderId": purchase_order.id,
        "quotationId": getattr(quotation, "id", None),
        "purchaseOrderNo": purchase_order.purchaseOrderNo or "",
        "quotationCode": getattr(quotation, "quotationCode", "") or "",
        "attentionName": getattr(quotation, "attentionName", "") or "",
        "companyName": getattr(quotation, "companyName", "") or "",
        "referenceNo": getattr(quotation, "referenceNo", "") or "",
        "costEstimationNo": getattr(quotation, "costEstimationNo", "") or "",
        "poDate": purchase_order.poDate.isoformat() if purchase_order.poDate else "",
        "poReceivedDate": (
            purchase_order.poReceivedDate.isoformat() if purchase_order.poReceivedDate else ""
        ),
        "expectedDate": purchase_order.expectedDate.isoformat() if purchase_order.expectedDate else "",
        "poReference": file_url,
        "hasJobCard": job_card is not None,
        "jobCardId": getattr(job_card, "id", None),
        "jobCardNo": getattr(job_card, "jobCardNo", "") or "",
        "rfqCategory": getattr(request_item, "rfqCategory", "") or "",
        "rfqCategoryLabel": (
            request_item.get_rfqCategory_display() if request_item is not None else ""
        ),
        "workflowLabel": "Purchase order",
        "created_at": purchase_order.created_at.isoformat() if purchase_order.created_at else "",
    }


def _build_job_card_queue_row_from_quotation(quotation):
    request_item = getattr(quotation, "salesServiceRequest", None)
    job_card = getattr(quotation, "jobCard", None)
    expected_date = (
        request_item.requiredDeliveryDate.isoformat()
        if getattr(request_item, "requiredDeliveryDate", None)
        else quotation.expiryDate.isoformat() if quotation.expiryDate else ""
    )
    workflow_label = "Direct RFQ"
    if getattr(request_item, "planningType", "") == SalesServiceRequest.PLANNING_TYPE_QUOTE_AFTER:
        workflow_label = "Quote After"

    return {
        "queueKey": f"quotation-{quotation.id}",
        "queueType": "quotation",
        "id": quotation.id,
        "purchaseOrderId": None,
        "quotationId": quotation.id,
        "purchaseOrderNo": "",
        "quotationCode": quotation.quotationCode or "",
        "attentionName": quotation.attentionName or "",
        "companyName": quotation.companyName or "",
        "referenceNo": quotation.referenceNo or "",
        "costEstimationNo": quotation.costEstimationNo or "",
        "poDate": "",
        "poReceivedDate": "",
        "expectedDate": expected_date,
        "poReference": "",
        "hasJobCard": job_card is not None,
        "jobCardId": getattr(job_card, "id", None),
        "jobCardNo": getattr(job_card, "jobCardNo", "") or "",
        "rfqCategory": getattr(request_item, "rfqCategory", "") or "",
        "rfqCategoryLabel": (
            request_item.get_rfqCategory_display() if request_item is not None else ""
        ),
        "workflowLabel": workflow_label,
        "created_at": quotation.created_at.isoformat() if quotation.created_at else "",
    }


def _get_latest_opening_stock():
    return (
        OpeningStock.objects.prefetch_related("rows__item")
        .order_by("-created_at", "-id")
        .first()
    )


def _normalise_opening_stock_payload(data):
    header = _parse_json_like(_read(data, "header", {}), dict, {})
    rows = _parse_json_like(_read(data, "rows", []), list, [])
    errors = {}
    normalised_rows = []
    seen_item_keys = set()

    if not rows:
        errors["rows"] = ["Add at least one opening stock item."]
        return errors, None

    for index, raw_row in enumerate(rows):
        if not isinstance(raw_row, dict):
            errors[f"rows.{index}"] = ["Each row must be an object."]
            continue

        item_id = str(_read(raw_row, "itemId", "") or "").strip()
        item = None
        if item_id:
            item = ItemFolder.objects.filter(id=_to_int(item_id)).first()
            if item is None:
                errors[f"rows.{index}.itemId"] = ["Selected item does not exist."]
                continue

        quantity = _to_float(_read(raw_row, "quantity", None), None)
        if quantity is None or quantity <= 0:
            errors[f"rows.{index}.quantity"] = ["Quantity must be greater than 0."]
            continue

        item_code = str(getattr(item, "itemCode", "") or _read(raw_row, "itemCode", "") or "").strip()
        item_name = str(getattr(item, "itemName", "") or _read(raw_row, "itemName", "") or "").strip()
        unit = str(getattr(item, "unit", "") or _read(raw_row, "unit", "") or "").strip()
        item_key = item_id or item_code or item_name

        if not item_key:
            errors[f"rows.{index}.itemId"] = ["Select an item before saving."]
            continue

        if item_key in seen_item_keys:
            errors[f"rows.{index}.itemId"] = ["Each item can be added only once."]
            continue

        seen_item_keys.add(item_key)
        normalised_rows.append(
            {
                "item": item,
                "itemCode": item_code,
                "itemName": item_name,
                "unit": unit,
                "quantity": quantity,
            }
        )

    if errors:
        return errors, None

    return (
        {},
        {
            "date": str(header.get("date", "") or "").strip(),
            "code": str(header.get("code", "") or "").strip(),
            "rows": normalised_rows,
        },
    )


def _get_sold_quantity_by_item_code(opening_stock, exclude_item_id=None):
    if not opening_stock:
        return {}

    sales_queryset = Item.objects.all()
    if opening_stock.created_at:
        sales_queryset = sales_queryset.filter(created_at__gte=opening_stock.created_at)

    if exclude_item_id:
        sales_queryset = sales_queryset.exclude(id=exclude_item_id)

    sold_rows = (
        sales_queryset.values("item_code")
        .annotate(total_quantity=Sum("quantity"))
        .order_by()
    )
    return {
        str(row.get("item_code") or "").strip(): _to_float(row.get("total_quantity"), 0)
        for row in sold_rows
    }


def _build_opening_stock_rows(opening_stock, exclude_item_id=None, include_zero_quantity=False):
    if not opening_stock:
        return []

    sold_by_code = _get_sold_quantity_by_item_code(
        opening_stock,
        exclude_item_id=exclude_item_id,
    )
    rows = []

    for row in opening_stock.rows.all():
        item = getattr(row, "item", None)
        item_code = str(getattr(item, "itemCode", "") or row.itemCode or "").strip()
        item_name = str(getattr(item, "itemName", "") or row.itemName or "").strip()
        unit = str(getattr(item, "unit", "") or row.unit or "").strip()
        opening_quantity = _to_float(row.quantity, 0)
        sold_quantity = sold_by_code.get(item_code, 0)
        available_quantity = max(opening_quantity - sold_quantity, 0)
        is_disabled = available_quantity <= 0

        if is_disabled and not include_zero_quantity:
            continue

        rows.append(
            {
                "itemId": str(item.id) if item else "",
                "itemCode": item_code,
                "itemName": item_name,
                "unit": unit,
                "salesPrice": getattr(item, "salesPrice", None),
                "itemDescription": str(getattr(item, "itemDescription", "") or "").strip(),
                "openingQuantity": opening_quantity,
                "soldQuantity": sold_quantity,
                "availableQuantity": available_quantity,
                "quantity": available_quantity,
                "disabled": is_disabled,
            }
        )

    rows.sort(key=lambda item: (item["itemName"], item["itemCode"]))
    return rows


def _build_opening_stock_response(opening_stock):
    if not opening_stock:
        return {
            "header": {
                "date": "",
                "code": "",
            },
            "rows": [],
            "created_at": None,
        }

    return {
        "id": opening_stock.id,
        "header": {
            "date": opening_stock.date or "",
            "code": opening_stock.code or "",
        },
        "rows": _build_opening_stock_rows(opening_stock, include_zero_quantity=True),
        "created_at": opening_stock.created_at.isoformat() if opening_stock.created_at else None,
    }


def _build_available_opening_stock(exclude_item_id=None):
    opening_stock = _get_latest_opening_stock()
    if not opening_stock:
        return {
            "header": {
                "date": "",
                "code": "",
            },
            "items": [],
        }

    return {
        "header": {
            "date": opening_stock.date or "",
            "code": opening_stock.code or "",
        },
        "items": _build_opening_stock_rows(
            opening_stock,
            exclude_item_id=exclude_item_id,
            include_zero_quantity=False,
        ),
    }


def _validate_available_stock_or_none(data, exclude_item_id=None):
    item_code = str(_read(data, "item_code", "") or "").strip()
    quantity = _to_float(_read(data, "quantity", None), None)
    amount = _to_float(_read(data, "amount", None), None)

    if not item_code or quantity is None or quantity <= 0:
        return None

    if amount is not None and amount <= 0:
        return Response(
            {
                "amount": ["Amount must be greater than 0."],
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    available_stock = _build_available_opening_stock(exclude_item_id=exclude_item_id)
    available_item = next(
        (item for item in available_stock["items"] if item["itemCode"] == item_code),
        None,
    )

    if available_item is None:
        return Response(
            {
                "item_code": ["This item is not available in opening stock."],
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if quantity > available_item["availableQuantity"]:
        quantity_text = (
            str(int(available_item["availableQuantity"]))
            if available_item["availableQuantity"].is_integer()
            else str(available_item["availableQuantity"])
        )
        message = f"Only {quantity_text}"
        if available_item["unit"]:
            message = f"{message} {available_item['unit']}"
        message = f"{message} available in opening stock."
        return Response(
            {
                "quantity": [message],
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    return None


def _normalise_currency(currency_source=None):
    currency_source = currency_source or {}
    code = str(
        _read(
            currency_source,
            "code",
            _read(currency_source, "currencyCode", DEFAULT_CURRENCY["code"]),
        )
        or DEFAULT_CURRENCY["code"]
    ).upper()
    currency = {**CURRENCIES_BY_CODE.get(code, DEFAULT_CURRENCY)}

    currency["name"] = (
        _read(currency_source, "name", _read(currency_source, "currencyName", currency["name"]))
        or currency["name"]
    )
    currency["symbol"] = (
        _read(currency_source, "symbol", _read(currency_source, "currencySymbol", currency["symbol"]))
        or currency["symbol"]
    )
    currency["amountLabel"] = (
        _read(
            currency_source,
            "amountLabel",
            _read(currency_source, "currencyAmountLabel", currency["amountLabel"]),
        )
        or currency["amountLabel"]
    )

    rate_to_inr = _to_float(
        _read(
            currency_source,
            "rateToInr",
            _read(currency_source, "currencyRateToInr", currency["rateToInr"]),
        ),
        currency["rateToInr"],
    )
    currency["rateToInr"] = rate_to_inr if rate_to_inr > 0 else currency["rateToInr"]
    if currency["code"] == "OMR":
        currency["symbol"] = "OMR"
    currency["prefix"] = "Rs." if currency["code"] == "INR" else currency["code"]
    return currency


def _convert_from_inr(value, currency):
    rate_to_inr = _to_float(currency.get("rateToInr"), 1.0)
    if rate_to_inr <= 0:
        rate_to_inr = 1.0
    return _to_float(value) / rate_to_inr


def _normalise_date(value):
    if isinstance(value, date):
        return value.isoformat()
    return value or ""


def _calculate_due_date(invoice_date, credit_days):
    if not invoice_date:
        return ""

    if isinstance(invoice_date, date):
        base_date = invoice_date
    else:
        try:
            base_date = date.fromisoformat(str(invoice_date))
        except ValueError:
            return ""

    return (base_date + timedelta(days=max(credit_days, 0))).isoformat()


def _normalise_items(items, currency=None):
    currency = _normalise_currency(currency)
    normalised = []

    for item in items:
        quantity = _to_float(_read(item, "quantity", 0))
        rate_in_inr = _to_float(_read(item, "rate", 0))
        discount = _to_float(_read(item, "discount", 0))
        amount_in_inr = _to_float(_read(item, "amount", 0))

        if amount_in_inr == 0:
            gross = quantity * rate_in_inr
            amount_in_inr = gross - (gross * discount / 100)

        normalised.append(
            {
                "ledger": _read(item, "ledger", ""),
                "bill_type": _read(item, "bill_type", ""),
                "date": _normalise_date(_read(item, "date", "")),
                "code": _read(item, "code", ""),
                "item_code": _read(item, "item_code", ""),
                "item_name": _read(item, "item_name", ""),
                "unit": _read(item, "unit", ""),
                "quantity": quantity,
                "rate": _convert_from_inr(rate_in_inr, currency),
                "discount": discount,
                "description": _read(item, "description", ""),
                "amount": _convert_from_inr(amount_in_inr, currency),
            }
        )

    return normalised


def _build_summary(summary_source, currency=None):
    currency = _normalise_currency(currency)
    taxable = _to_float(_read(summary_source, "taxable", 0))
    tax = _to_float(_read(summary_source, "tax", 0))
    discount = _to_float(_read(summary_source, "discount", 0))
    subtotal = _to_float(_read(summary_source, "subtotal", taxable))
    net = _to_float(_read(summary_source, "net", subtotal + tax))
    roundoff = _to_float(_read(summary_source, "roundoff", net - (subtotal + tax)))

    return {
        "taxable": _convert_from_inr(taxable, currency),
        "tax": _convert_from_inr(tax, currency),
        "discount": _convert_from_inr(discount, currency),
        "subtotal": _convert_from_inr(subtotal, currency),
        "roundoff": _convert_from_inr(roundoff, currency),
        "net": _convert_from_inr(net, currency),
    }


@lru_cache(maxsize=1)
def _get_logo_data_uri():
    logo_path = Path(__file__).resolve().parent / "templates" / "logo.png"
    if not logo_path.exists():
        return ""

    encoded = base64.b64encode(logo_path.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def _build_invoice_context(items, dispatch=None, summary=None, terms_type="Payment Terms", currency=None):
    dispatch = dispatch or {}
    summary = summary or {}
    currency = _normalise_currency(currency or dispatch)
    normalised_items = _normalise_items(items, currency=currency)
    latest_item = normalised_items[0] if normalised_items else {}
    credit_days = _to_int(_read(dispatch, "creditDays", 0))
    invoice_date = latest_item.get("date", "")
    billing_name = latest_item.get("ledger") or _read(dispatch, "supplierRef", "") or "Customer"
    dispatch_terms_type = _read(dispatch, "termsType", terms_type) or terms_type

    return {
        "company": COMPANY_DETAILS,
        "billing": {
            "name": billing_name,
            "address": _read(dispatch, "destination", "") or "Not provided",
            "gstin": "",
        },
        "invoice": {
            "no": latest_item.get("code") or _read(dispatch, "dispatchDocNo", "") or "N/A",
            "date": invoice_date or "N/A",
            "po": _read(dispatch, "supplierRef", "") or "N/A",
            "bill_type": latest_item.get("bill_type", ""),
        },
        "delivery": {
            "name": billing_name,
            "address": _read(dispatch, "destination", "") or "Not provided",
        },
        "payment": {
            "terms_type": dispatch_terms_type,
            "terms": _read(dispatch, "terms", "") or dispatch_terms_type,
            "due_date": _calculate_due_date(invoice_date, credit_days) or "N/A",
            "interest": "18%",
            "credit_days": credit_days,
            "dispatch_through": _read(dispatch, "dispatchThrough", ""),
        },
        "dispatch": {
            "supplierRef": _read(dispatch, "supplierRef", ""),
            "dispatchDocNo": _read(dispatch, "dispatchDocNo", ""),
            "destination": _read(dispatch, "destination", ""),
            "dispatchThrough": _read(dispatch, "dispatchThrough", ""),
            "remarks": _read(dispatch, "remarks", ""),
        },
        "summary": _build_summary(summary, currency=currency),
        "items": normalised_items,
        "terms_type": dispatch_terms_type,
        "logo_data_uri": _get_logo_data_uri(),
        "currency": currency,
    }


def _build_database_context(terms_type):
    items = list(Item.objects.all().order_by("-id"))
    latest_dispatch = DispatchSummary.objects.all().order_by("-created_at").first()
    context = _build_invoice_context(items, dispatch=latest_dispatch, summary=latest_dispatch, terms_type=terms_type)
    context["dispatch_summaries"] = DispatchSummary.objects.all().order_by("-created_at")
    return context


def employee_data_view(request):
    return render(request, "invoice.html", _build_database_context("Payment Terms"))


def general(request):
    return render(request, "invoice.html", _build_database_context("General Terms"))


def delivery(request):
    return render(request, "invoice.html", _build_database_context("Delivery Terms"))


def generate_pdf(request):
    _, _, auth_error = _authorize_request(
        request,
        ROLE_ADMIN,
        message="Only administrators can generate invoice PDFs.",
    )
    if auth_error is not None:
        return auth_error

    if request.method != "POST":
        return HttpResponse("Method not allowed", status=405)

    try:
        data = json.loads(request.body or "{}")
    except json.JSONDecodeError:
        return HttpResponse("Invalid JSON payload", status=400)

    dispatch = data.get("dispatch") or {}
    summary = data.get("summary") or {}
    items = data.get("items") or []
    currency = data.get("currency") or dispatch.get("currency") or {}
    context = _build_invoice_context(
        items=items,
        dispatch=dispatch,
        summary=summary,
        terms_type=dispatch.get("termsType", "General Terms"),
        currency=currency,
    )
    html_string = render_to_string("invoice.html", context)

    pdf_buffer = BytesIO()
    pdf_status = pisa.CreatePDF(html_string, dest=pdf_buffer, encoding="utf-8")
    if pdf_status.err:
        return HttpResponse("Failed to generate PDF", status=500)

    response = HttpResponse(pdf_buffer.getvalue(), content_type="application/pdf")
    filename = f'{context["terms_type"].replace(" ", "_").lower() or "invoice"}.pdf'
    response["Content-Disposition"] = f'attachment; filename="{filename}"'
    return response


@api_view(["GET", "POST"])
def add_item(request):
    _, _, auth_error = _authorize_request(
        request,
        ROLE_ADMIN,
        message="Only administrators can add invoice items.",
    )
    if auth_error is not None:
        return auth_error

    stock_error = _validate_available_stock_or_none(request.data)
    if stock_error is not None:
        return stock_error

    serializer = ItemSerializer(data=request.data)

    if serializer.is_valid():
        serializer.save()
        return Response(
            {"message": "Item added successfully", "data": serializer.data},
            status=status.HTTP_201_CREATED,
        )

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["GET"])
def get_items(request):
    _, _, auth_error = _authorize_request(
        request,
        ROLE_ADMIN,
        message="Only administrators can view invoice items.",
    )
    if auth_error is not None:
        return auth_error

    items = Item.objects.all().order_by("-id")
    serializer = ItemSerializer(items, many=True)
    return Response(serializer.data)


@api_view(["GET", "POST"])
def itemfolder_collection(request):
    allowed_roles = (ROLE_ADMIN,)
    _, _, auth_error = _authorize_request(
        request,
        *allowed_roles,
        message="Only administrators can manage item masters.",
    )
    if auth_error is not None:
        return auth_error

    if request.method == "GET":
        itemfolders = ItemFolder.objects.all().order_by("-created_at", "-id")
        serializer = ItemFolderSerializer(itemfolders, many=True, context={"request": request})
        return Response(serializer.data)

    payload = _extract_itemfolder_payload(request.data)
    payload["itemCode"] = _generate_next_itemfolder_code()
    serializer = ItemFolderSerializer(
        data=payload,
        context={"request": request},
    )

    if serializer.is_valid():
        serializer.save()
        return Response(
            {"message": "Item folder saved successfully", "data": serializer.data},
            status=status.HTTP_201_CREATED,
        )

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["GET", "PUT", "DELETE"])
def itemfolder_detail(request, id):
    _, _, auth_error = _authorize_request(
        request,
        ROLE_ADMIN,
        message="Only administrators can manage item masters.",
    )
    if auth_error is not None:
        return auth_error

    itemfolder = get_object_or_404(ItemFolder, id=id)

    if request.method == "GET":
        serializer = ItemFolderSerializer(itemfolder, context={"request": request})
        return Response(serializer.data)

    if request.method == "DELETE":
        itemfolder.delete()
        return Response({"message": "Item folder deleted"})

    payload = _extract_itemfolder_payload(request.data)
    if not str(payload.get("itemCode", "") or "").strip():
        payload["itemCode"] = itemfolder.itemCode or _generate_next_itemfolder_code()

    serializer = ItemFolderSerializer(
        itemfolder,
        data=payload,
        partial=True,
        context={"request": request},
    )

    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["GET"])
def itemfolder_next_code(request):
    _, _, auth_error = _authorize_request(
        request,
        ROLE_ADMIN,
        message="Only administrators can generate item codes.",
    )
    if auth_error is not None:
        return auth_error

    return Response({"itemCode": _generate_next_itemfolder_code()})


@api_view(["GET"])
def sales_service_next_reference(request):
    _, _, auth_error = _authorize_request(
        request,
        ROLE_SALES_EXECUTIVE,
        message="Only Sales Executive can prepare RFQs.",
    )
    if auth_error is not None:
        return auth_error

    request_date = _parse_iso_date(request.query_params.get("requestDate")) or date.today()
    return Response(
        {
            "referenceNo": _generate_next_sales_service_reference(request_date),
        }
    )


@api_view(["GET", "POST"])
@parser_classes(SALES_SERVICE_PARSER_CLASSES)
def sales_service_collection(request):
    if request.method == "GET":
        _, _, auth_error = _authorize_request(
            request,
            ROLE_SALES_EXECUTIVE,
            ROLE_LEAD_SALES,
            message="You do not have permission to view RFQs.",
        )
    else:
        _, _, auth_error = _authorize_request(
            request,
            ROLE_SALES_EXECUTIVE,
            message="Only Sales Executive can prepare RFQs.",
        )
    if auth_error is not None:
        return auth_error

    if request.method == "GET":
        sales_service_requests = (
            SalesServiceRequest.objects.prefetch_related(
                "costEstimationSheets",
                "quotations__purchaseOrder",
                "quotations__jobCard",
            )
            .order_by("-created_at", "-id")
        )
        serializer = SalesServiceRequestSerializer(
            sales_service_requests,
            many=True,
            context={"request": request},
        )
        return Response(serializer.data)

    request_date = _parse_iso_date(request.data.get("requestDate")) or date.today()
    payload = _normalise_sales_service_payload(
        _copy_request_payload(request, file_field_names=("clientImage",)),
    )
    payload["requestDate"] = request_date.isoformat()
    payload["referenceNo"] = _generate_next_sales_service_reference(request_date)
    if "isActive" not in payload:
        payload["isActive"] = True
    serializer = SalesServiceRequestSerializer(data=payload, context={"request": request})

    if serializer.is_valid():
        request_item = serializer.save()
        _ensure_special_rfq_workflow_records(request_item)
        response_serializer = SalesServiceRequestSerializer(
            request_item,
            context={"request": request},
        )
        return Response(
            {
                "message": "Sales and service request saved successfully",
                "data": response_serializer.data,
            },
            status=status.HTTP_201_CREATED,
        )

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["GET", "PUT", "DELETE"])
@parser_classes(SALES_SERVICE_PARSER_CLASSES)
def sales_service_detail(request, id):
    if request.method == "GET":
        _, _, auth_error = _authorize_request(
            request,
            ROLE_SALES_EXECUTIVE,
            ROLE_LEAD_SALES,
            message="You do not have permission to view RFQs.",
        )
    else:
        _, _, auth_error = _authorize_request(
            request,
            ROLE_SALES_EXECUTIVE,
            message="Only Sales Executive can update RFQs.",
        )
    if auth_error is not None:
        return auth_error

    sales_service_request = get_object_or_404(SalesServiceRequest, id=id)

    if request.method == "GET":
        serializer = SalesServiceRequestSerializer(
            sales_service_request,
            context={"request": request},
        )
        return Response(serializer.data)

    if request.method == "DELETE":
        if sales_service_request.costEstimationSheets.exists() or sales_service_request.quotations.exists():
            return Response(
                {
                    "error": "This RFQ is already used in workflow and cannot be deleted."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        sales_service_request.delete()
        return Response({"message": "Sales and service request deleted"})

    if sales_service_request.costEstimationSheets.exists() or sales_service_request.quotations.exists():
        return Response(
            {
                "error": "This RFQ is already used in workflow and cannot be edited."
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    payload = _normalise_sales_service_payload(
        _copy_request_payload(request, file_field_names=("clientImage",)),
    )
    payload["referenceNo"] = sales_service_request.referenceNo
    if "isActive" not in payload:
        payload["isActive"] = sales_service_request.isActive
    if "requestDate" in payload:
        request_date = _parse_iso_date(payload.get("requestDate")) or sales_service_request.requestDate
        payload["requestDate"] = request_date.isoformat()

    serializer = SalesServiceRequestSerializer(
        sales_service_request,
        data=payload,
        partial=True,
        context={"request": request},
    )

    if serializer.is_valid():
        request_item = serializer.save()
        _ensure_special_rfq_workflow_records(request_item)
        response_serializer = SalesServiceRequestSerializer(
            request_item,
            context={"request": request},
        )
        return Response(response_serializer.data)

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["GET"])
def cost_estimation_catalog(request):
    _, _, auth_error = _authorize_request(
        request,
        ROLE_LEAD_SALES,
        message="Only Lead Sales can prepare cost estimations.",
    )
    if auth_error is not None:
        return auth_error

    editing_sheet_id = _to_int(request.query_params.get("sheetId"), None)
    reference_filters = Q(costEstimationSheets__isnull=True)

    if editing_sheet_id is not None and editing_sheet_id > 0:
        editing_request_id = (
            CostEstimationSheet.objects.filter(id=editing_sheet_id)
            .values_list("salesServiceRequest_id", flat=True)
            .first()
        )
        if editing_request_id is not None:
            reference_filters |= Q(id=editing_request_id)

    references = list(
        SalesServiceRequest.objects.filter(
            reference_filters,
            rfqCategory=SalesServiceRequest.RFQ_CATEGORY_STANDARD,
        )
        .distinct()
        .order_by("-created_at", "-id")
        .values(
            "id",
            "referenceNo",
            "requestDate",
            "clientName",
            "companyName",
            "phoneNo",
            "email",
            "itemName",
            "quantity",
            "unit",
        )
    )

    serialized_rates = CostEstimationRateSerializer(
        CostEstimationRate.objects.all(),
        many=True,
    ).data
    section_rows = {section: [] for section in COST_ESTIMATION_SECTION_ORDER}

    for row in serialized_rates:
        section_rows.setdefault(row["section"], []).append(row)

    return Response(
        {
            "references": references,
            "sections": section_rows,
        }
    )


@api_view(["GET"])
def cost_estimation_next_number(request):
    _, _, auth_error = _authorize_request(
        request,
        ROLE_LEAD_SALES,
        message="Only Lead Sales can prepare cost estimations.",
    )
    if auth_error is not None:
        return auth_error

    reference_date = _resolve_cost_estimation_reference_date(
        request_date_value=request.query_params.get("requestDate"),
        sales_service_request_id=request.query_params.get("salesServiceRequestId"),
    )
    return Response(
        {
            "costEstimationNo": _generate_next_cost_estimation_number(reference_date),
        }
    )


def _get_cost_estimation_sheet_queryset(workflow=None):
    queryset = (
        CostEstimationSheet.objects.select_related("salesServiceRequest")
        .prefetch_related("rows", "quotations")
        .order_by("-created_at", "-id")
    )
    workflow = str(workflow or "").strip().lower()

    if workflow == "hod":
        latest_sheets = []
        seen_request_ids = set()
        for sheet in queryset.filter(
            sentToHead=True,
            hodStatus=CostEstimationSheet.APPROVAL_PENDING,
        ):
            if sheet.salesServiceRequest_id in seen_request_ids:
                continue
            seen_request_ids.add(sheet.salesServiceRequest_id)
            latest_sheets.append(sheet)
        return latest_sheets
    elif workflow == "md":
        latest_sheets = []
        seen_request_ids = set()
        for sheet in queryset.filter(
            sentToHead=True,
            hodStatus=CostEstimationSheet.APPROVAL_APPROVED,
            mdStatus=CostEstimationSheet.APPROVAL_PENDING,
        ):
            if sheet.salesServiceRequest_id in seen_request_ids:
                continue
            seen_request_ids.add(sheet.salesServiceRequest_id)
            latest_sheets.append(sheet)
        return latest_sheets

    return queryset


@api_view(["GET", "POST"])
def cost_estimation_sheet_collection(request):
    if request.method == "GET":
        workflow = str(request.query_params.get("workflow", "") or "").strip().lower()
        if workflow == "hod":
            _, _, auth_error = _authorize_request(
                request,
                ROLE_HOD,
                message="Only HOD can access the HOD cost estimation queue.",
            )
        elif workflow == "md":
            _, _, auth_error = _authorize_request(
                request,
                ROLE_MD,
                message="Only MD can access the MD cost estimation queue.",
            )
        else:
            _, _, auth_error = _authorize_request(
                request,
                ROLE_LEAD_SALES,
                message="Only Lead Sales can access cost estimation sheets.",
            )
    else:
        _, _, auth_error = _authorize_request(
            request,
            ROLE_LEAD_SALES,
            message="Only Lead Sales can prepare cost estimations.",
        )
    if auth_error is not None:
        return auth_error

    if request.method == "GET":
        sheets = _get_cost_estimation_sheet_queryset(request.query_params.get("workflow"))
        serializer = CostEstimationSheetSerializer(sheets, many=True)
        return Response(serializer.data)

    serializer = CostEstimationSheetSerializer(data=request.data)

    if serializer.is_valid():
        reference_date = _resolve_cost_estimation_reference_date(
            sales_service_request_id=request.data.get("salesServiceRequestId"),
        )
        serializer.save(
            costEstimationNo=_generate_next_cost_estimation_number(reference_date),
        )
        response_serializer = CostEstimationSheetSerializer(serializer.instance)
        return Response(
            {
                "message": "Cost estimation sheet saved successfully",
                "data": response_serializer.data,
            },
            status=status.HTTP_201_CREATED,
        )

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["GET", "PUT", "DELETE"])
def cost_estimation_sheet_detail(request, id):
    if request.method == "GET":
        _, _, auth_error = _authorize_request(
            request,
            ROLE_LEAD_SALES,
            ROLE_HOD,
            ROLE_MD,
            message="You do not have permission to view this cost estimation sheet.",
        )
    else:
        _, _, auth_error = _authorize_request(
            request,
            ROLE_LEAD_SALES,
            message="Only Lead Sales can update cost estimations.",
        )
    if auth_error is not None:
        return auth_error

    sheet = get_object_or_404(
        CostEstimationSheet.objects.select_related("salesServiceRequest").prefetch_related("rows"),
        id=id,
    )

    if request.method == "GET":
        serializer = CostEstimationSheetSerializer(sheet)
        return Response(serializer.data)

    if request.method == "DELETE":
        if sheet.is_workflow_locked():
            return Response(
                {
                    "error": "This cost estimation sheet is read only because it is already in approval, approved, or used in quotation."
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        sheet.delete()
        return Response({"message": "Cost estimation sheet deleted"})

    serializer = CostEstimationSheetSerializer(sheet, data=request.data)

    if serializer.is_valid():
        serializer.save()
        refreshed_sheet = (
            CostEstimationSheet.objects.select_related("salesServiceRequest")
            .prefetch_related("rows")
            .filter(id=sheet.id)
            .first()
        )
        response_serializer = CostEstimationSheetSerializer(refreshed_sheet)
        return Response(response_serializer.data)

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["POST"])
def cost_estimation_sheet_send_to_head(request, id):
    _, _, auth_error = _authorize_request(
        request,
        ROLE_LEAD_SALES,
        message="Only Lead Sales can send cost estimations for approval.",
    )
    if auth_error is not None:
        return auth_error

    sheet = get_object_or_404(
        CostEstimationSheet.objects.select_related("salesServiceRequest").prefetch_related("rows"),
        id=id,
    )

    if sheet.has_quotation():
        return Response(
            {"error": "Quoted cost estimation sheets cannot be sent for approval again."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if sheet.is_workflow_locked():
        return Response(
            {
                "error": "This cost estimation sheet is already in approval or approved."
            },
            status=status.HTTP_400_BAD_REQUEST,
        )
    sheet.sentToHead = True
    sheet.hodStatus = CostEstimationSheet.APPROVAL_PENDING
    sheet.hodComment = ""
    sheet.mdStatus = CostEstimationSheet.APPROVAL_PENDING
    sheet.mdComment = ""
    sheet.save(
        update_fields=[
            "sentToHead",
            "hodStatus",
            "hodComment",
            "mdStatus",
            "mdComment",
        ]
    )

    serializer = CostEstimationSheetSerializer(sheet)
    return Response(
        {
            "message": "Cost estimation sheet sent to HOD successfully.",
            "data": serializer.data,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
def cost_estimation_sheet_review(request, id):
    sheet = get_object_or_404(
        CostEstimationSheet.objects.select_related("salesServiceRequest").prefetch_related("rows"),
        id=id,
    )
    stage = str(request.data.get("stage", "") or "").strip().lower()
    approval_status = str(request.data.get("status", "") or "").strip().lower()
    comment = str(request.data.get("comment", "") or "").strip()

    if stage not in {"hod", "md"}:
        return Response(
            {"error": "Review stage must be hod or md."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    reviewer_role = ROLE_HOD if stage == "hod" else ROLE_MD
    _, _, auth_error = _authorize_request(
        request,
        reviewer_role,
        message=f"Only {stage.upper()} can complete this review.",
    )
    if auth_error is not None:
        return auth_error

    if approval_status not in {
        CostEstimationSheet.APPROVAL_APPROVED,
        CostEstimationSheet.APPROVAL_DECLINED,
    }:
        return Response(
            {"error": "Review status must be approved or declined."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not comment:
        return Response(
            {"comment": ["Comment is required."]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not sheet.sentToHead:
        return Response(
            {"error": "Send the cost estimation sheet to HOD before reviewing it."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    update_fields = []
    stage_label = "HOD" if stage == "hod" else "MD"

    if stage == "hod":
        if sheet.hodStatus != CostEstimationSheet.APPROVAL_PENDING:
            return Response(
                {"error": "HOD review is available only for waiting cost estimation sheets."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        sheet.hodStatus = approval_status
        sheet.hodComment = comment
        update_fields.extend(["hodStatus", "hodComment"])

        # A fresh HOD review always resets the MD stage so the latest version
        # follows the approval sequence again.
        sheet.mdStatus = CostEstimationSheet.APPROVAL_PENDING
        sheet.mdComment = ""
        update_fields.extend(["mdStatus", "mdComment"])
    else:
        if sheet.hodStatus != CostEstimationSheet.APPROVAL_APPROVED:
            return Response(
                {"error": "MD review is available only after HOD approval."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if sheet.mdStatus != CostEstimationSheet.APPROVAL_PENDING:
            return Response(
                {"error": "MD review is available only for waiting cost estimation sheets."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        sheet.mdStatus = approval_status
        sheet.mdComment = comment
        update_fields.extend(["mdStatus", "mdComment"])

    sheet.save(update_fields=update_fields)
    serializer = CostEstimationSheetSerializer(sheet)
    return Response(
        {
            "message": f"{stage_label} review saved successfully.",
            "data": serializer.data,
        },
        status=status.HTTP_200_OK,
    )

@api_view(["GET"])
def quotation_catalog(request):
    _, _, auth_error = _authorize_request(
        request,
        ROLE_LEAD_SALES,
        message="Only Lead Sales can prepare quotations.",
    )
    if auth_error is not None:
        return auth_error

    sales_service_requests = (
        SalesServiceRequest.objects.filter(
            rfqCategory=SalesServiceRequest.RFQ_CATEGORY_STANDARD,
            costEstimationSheets__isnull=False,
            quotations__isnull=True,
        )
        .distinct()
        .prefetch_related(
            Prefetch(
                "costEstimationSheets",
                queryset=CostEstimationSheet.objects.order_by("-created_at", "-id"),
            ),
        )
        .order_by("-created_at", "-id")
    )

    request_rows = []
    for request_item in sales_service_requests:
        latest_cost_estimation = _get_latest_approved_cost_estimation(request_item)
        if latest_cost_estimation is None:
            continue

        request_rows.append(
            {
                "id": request_item.id,
                "referenceNo": request_item.referenceNo,
                "requestDate": request_item.requestDate,
                "clientName": request_item.clientName,
                "companyName": request_item.companyName,
                "phoneNo": request_item.phoneNo,
                "email": request_item.email,
                "scopeDetails": _build_scope_details_for_quotation(request_item),
                "costEstimationSheetId": latest_cost_estimation.id,
                "costEstimationNo": latest_cost_estimation.costEstimationNo,
                "costEstimationTotal": latest_cost_estimation.finalBatteryCost,
                "nextRevisionNo": 0,
            }
        )

    return Response({"requests": request_rows}, status=status.HTTP_200_OK)


@api_view(["GET"])
def quotation_next_number(request):
    _, _, auth_error = _authorize_request(
        request,
        ROLE_LEAD_SALES,
        message="Only Lead Sales can prepare quotations.",
    )
    if auth_error is not None:
        return auth_error

    quotation_date = _parse_iso_date(request.query_params.get("quotationDate")) or date.today()
    return Response(
        {
            "quotationCode": _generate_next_quotation_number(quotation_date),
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET", "POST"])
def quotation_collection(request):
    if request.method == "GET":
        workflow = str(request.query_params.get("workflow", "") or "").strip().lower()
        if workflow == "hod":
            _, _, auth_error = _authorize_request(
                request,
                ROLE_HOD,
                message="Only HOD can access the HOD quotation queue.",
            )
        elif workflow == "md":
            _, _, auth_error = _authorize_request(
                request,
                ROLE_MD,
                message="Only MD can access the MD quotation queue.",
            )
        else:
            _, _, auth_error = _authorize_request(
                request,
                ROLE_LEAD_SALES,
                ROLE_OPERATION_HEAD,
                message="Only Lead Sales can access quotations.",
            )
    else:
        _, _, auth_error = _authorize_request(
            request,
            ROLE_LEAD_SALES,
            message="Only Lead Sales can prepare quotations.",
        )
    if auth_error is not None:
        return auth_error

    if request.method == "GET":
        quotations = _get_quotation_queryset(
            request.query_params.get("workflow"),
            request.query_params.get("planningType"),
        )
        serializer = QuotationSerializer(quotations, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    serializer = QuotationSerializer(data=request.data)

    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    sales_service_request = serializer.validated_data["salesServiceRequest"]
    quotation_date = serializer.validated_data.get("quotationDate") or date.today()
    currency = _normalise_currency(request.data.get("currency") or serializer.validated_data)
    quotation = serializer.save(
        quotationCode=_generate_next_quotation_number(quotation_date),
        revisedNo=_get_next_quotation_revision(sales_service_request.id),
        currencyName=currency["name"],
        currencyCode=currency["code"],
        currencySymbol=currency["symbol"],
        currencyRateToInr=currency["rateToInr"],
        currencyAmountLabel=currency["amountLabel"],
    )
    response_serializer = QuotationSerializer(quotation)
    return Response(
        {
            "message": "Quotation saved successfully",
            "data": response_serializer.data,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "DELETE"])
def quotation_detail(request, id):
    if request.method == "GET":
        _, _, auth_error = _authorize_request(
            request,
            ROLE_LEAD_SALES,
            ROLE_HOD,
            ROLE_MD,
            ROLE_OPERATION_HEAD,
            message="You do not have permission to view this quotation.",
        )
    else:
        _, _, auth_error = _authorize_request(
            request,
            ROLE_LEAD_SALES,
            message="Only Lead Sales can delete quotations.",
        )
    if auth_error is not None:
        return auth_error

    quotation = get_object_or_404(
        Quotation.objects.select_related(
            "salesServiceRequest",
            "costEstimationSheet",
            "purchaseOrder",
            "jobCard",
        ),
        id=id,
    )

    if request.method == "GET":
        serializer = QuotationSerializer(quotation)
        return Response(serializer.data, status=status.HTTP_200_OK)

    if quotation.is_workflow_locked():
        return Response(
            {
                "error": "This quotation is read only because it is already in approval or approved."
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if hasattr(quotation, "purchaseOrder"):
        return Response(
            {"error": "This quotation cannot be deleted because a purchase order already exists."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    quotation.delete()
    return Response({"message": "Quotation deleted"}, status=status.HTTP_200_OK)


@api_view(["POST"])
def quotation_send_to_head(request, id):
    _, _, auth_error = _authorize_request(
        request,
        ROLE_LEAD_SALES,
        message="Only Lead Sales can send quotations for approval.",
    )
    if auth_error is not None:
        return auth_error

    quotation = get_object_or_404(
        Quotation.objects.select_related(
            "salesServiceRequest",
            "costEstimationSheet",
            "purchaseOrder",
            "jobCard",
        ),
        id=id,
    )

    if hasattr(quotation, "purchaseOrder"):
        return Response(
            {"error": "Purchase order quotations cannot be sent for approval again."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if quotation.is_workflow_locked():
        return Response(
            {"error": "This quotation is already in approval or approved."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    quotation.sentToHead = True
    quotation.hodStatus = Quotation.APPROVAL_PENDING
    quotation.hodComment = ""
    quotation.mdStatus = Quotation.APPROVAL_PENDING
    quotation.mdComment = ""
    quotation.clientStatus = Quotation.CLIENT_STATUS_PENDING
    quotation.clientComment = ""
    quotation.save(
        update_fields=[
            "sentToHead",
            "hodStatus",
            "hodComment",
            "mdStatus",
            "mdComment",
            "clientStatus",
            "clientComment",
        ]
    )

    serializer = QuotationSerializer(quotation)
    return Response(
        {
            "message": "Quotation sent to HOD successfully.",
            "data": serializer.data,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
def quotation_review(request, id):
    quotation = get_object_or_404(
        Quotation.objects.select_related(
            "salesServiceRequest",
            "costEstimationSheet",
            "purchaseOrder",
            "jobCard",
        ),
        id=id,
    )
    stage = str(request.data.get("stage", "") or "").strip().lower()
    approval_status = str(request.data.get("status", "") or "").strip().lower()
    comment = str(request.data.get("comment", "") or "").strip()

    if stage not in {"hod", "md"}:
        return Response(
            {"error": "Review stage must be hod or md."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    reviewer_role = ROLE_HOD if stage == "hod" else ROLE_MD
    _, _, auth_error = _authorize_request(
        request,
        reviewer_role,
        message=f"Only {stage.upper()} can complete this review.",
    )
    if auth_error is not None:
        return auth_error

    if approval_status not in {
        Quotation.APPROVAL_APPROVED,
        Quotation.APPROVAL_DECLINED,
    }:
        return Response(
            {"error": "Review status must be approved or declined."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not comment:
        return Response(
            {"comment": ["Comment is required."]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not quotation.sentToHead:
        return Response(
            {"error": "Send the quotation to HOD before reviewing it."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    update_fields = []
    stage_label = "HOD" if stage == "hod" else "MD"

    if stage == "hod":
        if quotation.hodStatus != Quotation.APPROVAL_PENDING:
            return Response(
                {"error": "HOD review is available only for waiting quotations."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        quotation.hodStatus = approval_status
        quotation.hodComment = comment
        quotation.mdStatus = Quotation.APPROVAL_PENDING
        quotation.mdComment = ""
        quotation.clientStatus = Quotation.CLIENT_STATUS_PENDING
        quotation.clientComment = ""
        update_fields.extend(
            [
                "hodStatus",
                "hodComment",
                "mdStatus",
                "mdComment",
                "clientStatus",
                "clientComment",
            ]
        )
    else:
        if quotation.hodStatus != Quotation.APPROVAL_APPROVED:
            return Response(
                {"error": "MD review is available only after HOD approval."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if quotation.mdStatus != Quotation.APPROVAL_PENDING:
            return Response(
                {"error": "MD review is available only for waiting quotations."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        quotation.mdStatus = approval_status
        quotation.mdComment = comment
        quotation.clientStatus = Quotation.CLIENT_STATUS_PENDING
        quotation.clientComment = ""
        update_fields.extend(
            [
                "mdStatus",
                "mdComment",
                "clientStatus",
                "clientComment",
            ]
        )

    quotation.save(update_fields=update_fields)
    serializer = QuotationSerializer(quotation)
    return Response(
        {
            "message": f"{stage_label} review saved successfully.",
            "data": serializer.data,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
def quotation_client_response(request, id):
    _, _, auth_error = _authorize_request(
        request,
        ROLE_LEAD_SALES,
        message="Only Lead Sales can record client responses.",
    )
    if auth_error is not None:
        return auth_error

    quotation = get_object_or_404(
        Quotation.objects.select_related("salesServiceRequest", "costEstimationSheet"),
        id=id,
    )
    client_status = str(request.data.get("status", "") or "").strip().lower()
    comment = str(request.data.get("comment", "") or "").strip()

    if client_status not in {
        Quotation.CLIENT_STATUS_ACCEPTED,
        Quotation.CLIENT_STATUS_REJECTED,
    }:
        return Response(
            {"error": "Client status must be accepted or rejected."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if quotation.uses_direct_job_card_flow():
        return Response(
            {
                "error": "Client response is not required for quote of assessment or quote of completion workflows."
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if quotation.get_overall_status() != Quotation.APPROVAL_APPROVED:
        return Response(
            {"error": "Client response is available only after HOD and MD approval."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if hasattr(quotation, "purchaseOrder"):
        return Response(
            {"error": "Client response cannot be updated after a purchase order is created."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    quotation.clientStatus = client_status
    quotation.clientComment = comment
    quotation.save(update_fields=["clientStatus", "clientComment"])

    serializer = QuotationSerializer(quotation)
    return Response(
        {
            "message": "Client response saved successfully.",
            "data": serializer.data,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
def purchase_order_catalog(request):
    _, _, auth_error = _authorize_request(
        request,
        *PURCHASE_ORDER_ALLOWED_ROLES,
        message="You do not have permission to access purchase orders.",
    )
    if auth_error is not None:
        return auth_error

    quotations = (
        Quotation.objects.select_related("salesServiceRequest", "costEstimationSheet")
        .filter(
            salesServiceRequest__rfqCategory=SalesServiceRequest.RFQ_CATEGORY_STANDARD,
            hodStatus=Quotation.APPROVAL_APPROVED,
            mdStatus=Quotation.APPROVAL_APPROVED,
            clientStatus=Quotation.CLIENT_STATUS_ACCEPTED,
            purchaseOrder__isnull=True,
        )
        .order_by("-created_at", "-id")
    )

    return Response(
        {"quotations": [_build_purchase_order_catalog_row(quotation) for quotation in quotations]},
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
def purchase_order_next_number(request):
    _, _, auth_error = _authorize_request(
        request,
        *PURCHASE_ORDER_ALLOWED_ROLES,
        message="You do not have permission to access purchase orders.",
    )
    if auth_error is not None:
        return auth_error

    purchase_order_date = _parse_iso_date(request.query_params.get("poDate")) or date.today()
    return Response(
        {
            "purchaseOrderNo": _generate_next_purchase_order_number(purchase_order_date),
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET", "POST"])
@parser_classes((MultiPartParser, FormParser, JSONParser))
def purchase_order_collection(request):
    _, _, auth_error = _authorize_request(
        request,
        *PURCHASE_ORDER_ALLOWED_ROLES,
        message="You do not have permission to access purchase orders.",
    )
    if auth_error is not None:
        return auth_error

    if request.method == "GET":
        purchase_orders = PurchaseOrder.objects.select_related(
            "jobCard",
            "quotation",
            "quotation__salesServiceRequest",
            "quotation__costEstimationSheet",
        ).all()
        serializer = PurchaseOrderSerializer(
            purchase_orders,
            many=True,
            context={"request": request},
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    serializer = PurchaseOrderSerializer(data=request.data, context={"request": request})

    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    po_date = serializer.validated_data.get("poDate") or date.today()
    purchase_order = serializer.save(
        purchaseOrderNo=_generate_next_purchase_order_number(po_date),
    )
    response_serializer = PurchaseOrderSerializer(
        purchase_order,
        context={"request": request},
    )
    return Response(
        {
            "message": "Purchase order saved successfully",
            "data": response_serializer.data,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "PUT", "DELETE"])
@parser_classes((MultiPartParser, FormParser, JSONParser))
def purchase_order_detail(request, id):
    _, _, auth_error = _authorize_request(
        request,
        *PURCHASE_ORDER_ALLOWED_ROLES,
        message="You do not have permission to access purchase orders.",
    )
    if auth_error is not None:
        return auth_error

    purchase_order = get_object_or_404(
        PurchaseOrder.objects.select_related(
            "jobCard",
            "quotation",
            "quotation__salesServiceRequest",
            "quotation__costEstimationSheet",
        ),
        id=id,
    )

    if request.method == "GET":
        serializer = PurchaseOrderSerializer(
            purchase_order,
            context={"request": request},
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    if request.method == "DELETE":
        try:
            purchase_order.delete()
        except ProtectedError:
            return Response(
                {
                    "error": (
                        "This purchase order cannot be deleted because a job card already exists."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({"message": "Purchase order deleted"}, status=status.HTTP_200_OK)

    payload = _copy_request_payload(request, file_field_names=("poReference",))
    if "quotationId" not in payload:
        payload["quotationId"] = purchase_order.quotation_id

    serializer = PurchaseOrderSerializer(
        purchase_order,
        data=payload,
        partial=True,
        context={"request": request},
    )

    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    serializer.save()
    response_serializer = PurchaseOrderSerializer(
        serializer.instance,
        context={"request": request},
    )
    return Response(
        {
            "message": "Purchase order updated successfully",
            "data": response_serializer.data,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
def job_card_queue_collection(request):
    _, _, auth_error = _authorize_request(
        request,
        *JOB_CARD_ALLOWED_ROLES,
        message="You do not have permission to access the job card queue.",
    )
    if auth_error is not None:
        return auth_error

    purchase_orders = (
        PurchaseOrder.objects.select_related(
            "jobCard",
            "quotation",
            "quotation__salesServiceRequest",
            "quotation__costEstimationSheet",
        )
        .filter(jobCard__isnull=True)
        .order_by("-created_at", "-id")
    )
    direct_quotations = (
        Quotation.objects.select_related("salesServiceRequest", "costEstimationSheet", "jobCard")
        .filter(
            purchaseOrder__isnull=True,
            jobCard__isnull=True,
        )
        .filter(
            Q(
                salesServiceRequest__rfqCategory__in=[
                    SalesServiceRequest.RFQ_CATEGORY_QUOTE_OF_ASSESSMENT,
                    SalesServiceRequest.RFQ_CATEGORY_QUOTE_OF_COMPLETION,
                ],
            )
            | Q(
                salesServiceRequest__planningType=SalesServiceRequest.PLANNING_TYPE_QUOTE_AFTER,
            )
        )
        .order_by("-created_at", "-id")
    )

    rows = [_build_job_card_queue_row_from_purchase_order(row, request=request) for row in purchase_orders]
    rows.extend(
        _build_job_card_queue_row_from_quotation(row)
        for row in direct_quotations
        if row.can_enter_direct_job_card_queue()
    )
    rows.sort(key=lambda row: (row.get("created_at", ""), row.get("queueKey", "")), reverse=True)

    return Response(rows, status=status.HTTP_200_OK)


@api_view(["GET"])
def job_card_opening_detail(request, purchase_order_id):
    _, _, auth_error = _authorize_request(
        request,
        *JOB_CARD_ALLOWED_ROLES,
        message="You do not have permission to access job cards.",
    )
    if auth_error is not None:
        return auth_error

    purchase_order = get_object_or_404(
        PurchaseOrder.objects.select_related(
            "quotation",
            "quotation__salesServiceRequest",
            "quotation__costEstimationSheet",
            "jobCard",
        ).prefetch_related("quotation__costEstimationSheet__rows"),
        id=purchase_order_id,
    )
    job_card = getattr(purchase_order, "jobCard", None)

    return Response(
        {
            "jobCard": (
                JobCardSerializer(job_card, context={"request": request}).data
                if job_card is not None
                else None
            ),
            "opening": _build_job_card_opening_payload(
                purchase_order,
                job_card=job_card,
            ),
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
def job_card_opening_quotation_detail(request, quotation_id):
    _, _, auth_error = _authorize_request(
        request,
        *JOB_CARD_ALLOWED_ROLES,
        message="You do not have permission to access job cards.",
    )
    if auth_error is not None:
        return auth_error

    quotation = get_object_or_404(
        Quotation.objects.select_related(
            "salesServiceRequest",
            "costEstimationSheet",
            "jobCard",
        ).prefetch_related("costEstimationSheet__rows"),
        id=quotation_id,
    )

    if not quotation.can_enter_direct_job_card_queue() and not hasattr(quotation, "jobCard"):
        return Response(
            {
                "error": "This quotation is not ready for direct job card opening."
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    job_card = getattr(quotation, "jobCard", None)

    return Response(
        {
            "jobCard": (
                JobCardSerializer(job_card, context={"request": request}).data
                if job_card is not None
                else None
            ),
            "opening": _build_job_card_opening_payload(
                quotation,
                job_card=job_card,
            ),
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET", "POST"])
@parser_classes((FormParser, JSONParser))
def job_card_collection(request):
    workflow = str(request.query_params.get("workflow", "") or "").strip().lower()
    if request.method == "GET" and workflow == "hod":
        _, _, auth_error = _authorize_request(
            request,
            ROLE_HOD,
            message="Only HOD can access the HOD job card list.",
        )
    else:
        _, _, auth_error = _authorize_request(
            request,
            *JOB_CARD_ALLOWED_ROLES,
            message="You do not have permission to access job cards.",
        )
    if auth_error is not None:
        return auth_error

    if request.method == "GET":
        job_cards = JobCard.objects.select_related(
            "operationRegister",
            "purchaseOrder",
            "purchaseOrder__quotation",
            "purchaseOrder__quotation__salesServiceRequest",
            "purchaseOrder__quotation__costEstimationSheet",
            "quotation",
            "quotation__salesServiceRequest",
            "quotation__costEstimationSheet",
        ).prefetch_related(
            "purchaseOrder__quotation__costEstimationSheet__rows",
            "quotation__costEstimationSheet__rows",
        )
        if workflow == "store_manager":
            workshop_job_card_filter = (
                Q(
                    purchaseOrder__quotation__salesServiceRequest__rfqType=
                    SalesServiceRequest.RFQ_TYPE_WORKSHOP,
                )
                | Q(
                    quotation__salesServiceRequest__rfqType=
                    SalesServiceRequest.RFQ_TYPE_WORKSHOP,
                )
            )
            job_cards = job_cards.filter(
                workshop_job_card_filter,
                sentToStoreManager=True,
                sentToHod=False,
            )
        elif workflow == "hod":
            job_cards = job_cards.filter(sentToHod=True)

        serializer = JobCardSerializer(job_cards, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    payload = _copy_request_payload(request)
    serializer = JobCardSerializer(data=payload, context={"request": request})

    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    job_card = serializer.save(jobCardNo=_generate_next_job_card_number())
    response_serializer = JobCardSerializer(job_card, context={"request": request})
    return Response(
        {
            "message": "Job card saved successfully",
            "data": response_serializer.data,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "PUT"])
@parser_classes((FormParser, JSONParser))
def job_card_detail(request, id):
    _, _, auth_error = _authorize_request(
        request,
        *JOB_CARD_ALLOWED_ROLES,
        message="You do not have permission to access job cards.",
    )
    if auth_error is not None:
        return auth_error

    job_card = get_object_or_404(
        JobCard.objects.select_related(
            "operationRegister",
            "purchaseOrder",
            "purchaseOrder__quotation",
            "purchaseOrder__quotation__salesServiceRequest",
            "purchaseOrder__quotation__costEstimationSheet",
            "quotation",
            "quotation__salesServiceRequest",
            "quotation__costEstimationSheet",
        ).prefetch_related(
            "purchaseOrder__quotation__costEstimationSheet__rows",
            "quotation__costEstimationSheet__rows",
        ),
        id=id,
    )

    if request.method == "GET":
        serializer = JobCardSerializer(job_card, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    payload = _copy_request_payload(request)
    if "purchaseOrderId" not in payload and job_card.purchaseOrder_id is not None:
        payload["purchaseOrderId"] = job_card.purchaseOrder_id
    if "quotationId" not in payload and job_card.quotation_id is not None:
        payload["quotationId"] = job_card.quotation_id

    serializer = JobCardSerializer(
        job_card,
        data=payload,
        partial=True,
        context={"request": request},
    )

    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    serializer.save()
    if (
        _job_card_requires_store_manager_approval(job_card)
        and any(
            field_name in serializer.validated_data
            for field_name in ("jobCardDate", "planningDate", "expectedDate", "remarks", "deliveryRemark")
        )
        and (
            serializer.instance.grnNo
            or serializer.instance.sentToStoreManager
            or serializer.instance.storeManagerApproved
            or serializer.instance.storeManagerComment
            or serializer.instance.sentToHod
        )
    ):
        serializer.instance.grnNo = ""
        serializer.instance.sentToStoreManager = False
        serializer.instance.storeManagerApproved = False
        serializer.instance.storeManagerComment = ""
        serializer.instance.sentToHod = False
        serializer.instance.save(
            update_fields=[
                "grnNo",
                "sentToStoreManager",
                "storeManagerApproved",
                "storeManagerComment",
                "sentToHod",
            ]
        )
    response_serializer = JobCardSerializer(serializer.instance, context={"request": request})
    return Response(
        {
            "message": "Job card updated successfully",
            "data": response_serializer.data,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
def job_card_notify_store_manager(request, id):
    _, _, auth_error = _authorize_request(
        request,
        *JOB_CARD_ALLOWED_ROLES,
        message="You do not have permission to notify Store Manager.",
    )
    if auth_error is not None:
        return auth_error

    job_card = get_object_or_404(
        JobCard.objects.select_related(
            "operationRegister",
            "purchaseOrder",
            "purchaseOrder__quotation",
            "purchaseOrder__quotation__salesServiceRequest",
            "purchaseOrder__quotation__costEstimationSheet",
            "quotation",
            "quotation__salesServiceRequest",
            "quotation__costEstimationSheet",
        ).prefetch_related(
            "purchaseOrder__quotation__costEstimationSheet__rows",
            "quotation__costEstimationSheet__rows",
        ),
        id=id,
    )

    if not _job_card_requires_store_manager_approval(job_card):
        return Response(
            {"error": "Notify Store is available only for workshop job cards."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if job_card.sentToStoreManager:
        return Response(
            {"error": "This job card is already sent to Store Manager."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    job_card.sentToStoreManager = True
    job_card.grnNo = job_card.grnNo or _generate_next_grn_number()
    job_card.save(update_fields=["sentToStoreManager", "grnNo"])
    serializer = JobCardSerializer(job_card, context={"request": request})
    return Response(
        {
            "message": "Job card sent to Store Manager successfully.",
            "data": serializer.data,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
def job_card_store_manager_approve(request, id):
    _, _, auth_error = _authorize_request(
        request,
        ROLE_OPERATION_HEAD,
        message="Only Store Manager can approve workshop job cards.",
    )
    if auth_error is not None:
        return auth_error

    job_card = get_object_or_404(
        JobCard.objects.select_related(
            "purchaseOrder",
            "purchaseOrder__quotation",
            "purchaseOrder__quotation__salesServiceRequest",
            "purchaseOrder__quotation__costEstimationSheet",
            "quotation",
            "quotation__salesServiceRequest",
            "quotation__costEstimationSheet",
        ).prefetch_related(
            "purchaseOrder__quotation__costEstimationSheet__rows",
            "quotation__costEstimationSheet__rows",
        ),
        id=id,
    )

    if not _job_card_requires_store_manager_approval(job_card):
        return Response(
            {"error": "Store Manager approval is available only for workshop job cards."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not job_card.sentToStoreManager:
        return Response(
            {"error": "Notify Store before approving the workshop job card."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if job_card.storeManagerApproved:
        return Response(
            {"error": "This job card is already approved by Store Manager."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    comment = str(request.data.get("comment", "") or "").strip()
    if not comment:
        return Response(
            {"error": "Store Manager comment is required before approval."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    job_card.storeManagerApproved = True
    job_card.storeManagerComment = comment
    job_card.save(update_fields=["storeManagerApproved", "storeManagerComment"])
    serializer = JobCardSerializer(job_card, context={"request": request})
    return Response(
        {
            "message": "Store Manager approved the job card successfully.",
            "data": serializer.data,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
def job_card_send_to_hod(request, id):
    _, _, auth_error = _authorize_request(
        request,
        ROLE_OPERATION_HEAD,
        message="Only Store Manager can send job cards to HOD.",
    )
    if auth_error is not None:
        return auth_error

    job_card = get_object_or_404(
        JobCard.objects.select_related(
            "purchaseOrder",
            "purchaseOrder__quotation",
            "purchaseOrder__quotation__salesServiceRequest",
            "purchaseOrder__quotation__costEstimationSheet",
            "quotation",
            "quotation__salesServiceRequest",
            "quotation__costEstimationSheet",
        ).prefetch_related(
            "purchaseOrder__quotation__costEstimationSheet__rows",
            "quotation__costEstimationSheet__rows",
        ),
        id=id,
    )

    if (
        _job_card_requires_store_manager_approval(job_card)
        and (
            not job_card.sentToStoreManager
            or not job_card.storeManagerApproved
        )
    ):
        return Response(
            {"error": "Approve the job card in Store Manager before sending it to HOD."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if job_card.sentToHod:
        return Response(
            {"error": "This job card is already sent to HOD."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    job_card.sentToHod = True
    job_card.save(update_fields=["sentToHod"])
    serializer = JobCardSerializer(job_card, context={"request": request})
    return Response(
        {
            "message": "Job card sent to HOD successfully.",
            "data": serializer.data,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
def operation_register_opening_detail(request, job_card_id):
    _, _, auth_error = _authorize_request(
        request,
        ROLE_HOD,
        ROLE_SITE_ENGINEER,
        message="You do not have permission to access operation registers.",
    )
    if auth_error is not None:
        return auth_error

    job_card = get_object_or_404(
        JobCard.objects.select_related(
            "operationRegister",
            "purchaseOrder",
            "purchaseOrder__quotation",
            "purchaseOrder__quotation__salesServiceRequest",
            "quotation",
            "quotation__salesServiceRequest",
        ),
        id=job_card_id,
    )

    if not job_card.sentToHod:
        return Response(
            {"error": "Operation register is available only after the job card is sent to HOD."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    operation_register = getattr(job_card, "operationRegister", None)
    return Response(
        {
            "operationRegister": (
                OperationRegisterSerializer(operation_register, context={"request": request}).data
                if operation_register is not None
                else None
            ),
            "opening": _build_operation_register_opening_payload(job_card, operation_register),
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET", "POST"])
@parser_classes((FormParser, JSONParser))
def operation_register_collection(request):
    workflow = str(request.query_params.get("workflow", "") or "").strip().lower()
    if request.method == "GET" and workflow == "work_queue":
        _, _, auth_error = _authorize_request(
            request,
            ROLE_SITE_ENGINEER,
            message="Only Site Engineer can access the work queue.",
        )
    else:
        _, _, auth_error = _authorize_request(
            request,
            ROLE_HOD,
            message="Only HOD can access operation registers.",
        )
    if auth_error is not None:
        return auth_error

    if request.method == "GET":
        operation_registers = OperationRegister.objects.select_related(
            "jobCard",
            "jobCard__purchaseOrder",
            "jobCard__purchaseOrder__quotation",
            "jobCard__purchaseOrder__quotation__salesServiceRequest",
            "jobCard__quotation",
            "jobCard__quotation__salesServiceRequest",
        )
        if workflow == "work_queue":
            operation_registers = operation_registers.filter(assignedToSiteEngineer=True)
        else:
            operation_registers = operation_registers.filter(assignedToSiteEngineer=False)

        serializer = OperationRegisterSerializer(
            operation_registers,
            many=True,
            context={"request": request},
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    serializer = OperationRegisterSerializer(data=request.data, context={"request": request})
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    operation_register = serializer.save(
        operationNo=_generate_next_operation_number(),
        opDate=date.today(),
    )
    response_serializer = OperationRegisterSerializer(
        operation_register,
        context={"request": request},
    )
    return Response(
        {
            "message": "Operation register saved successfully.",
            "data": response_serializer.data,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET", "PUT"])
@parser_classes((FormParser, JSONParser))
def operation_register_detail(request, id):
    if request.method == "GET":
        _, _, auth_error = _authorize_request(
            request,
            ROLE_HOD,
            ROLE_SITE_ENGINEER,
            message="You do not have permission to access operation registers.",
        )
    else:
        _, _, auth_error = _authorize_request(
            request,
            ROLE_HOD,
            message="Only HOD can update operation registers.",
        )
    if auth_error is not None:
        return auth_error

    operation_register = get_object_or_404(
        OperationRegister.objects.select_related(
            "jobCard",
            "jobCard__purchaseOrder",
            "jobCard__purchaseOrder__quotation",
            "jobCard__purchaseOrder__quotation__salesServiceRequest",
            "jobCard__quotation",
            "jobCard__quotation__salesServiceRequest",
        ),
        id=id,
    )

    if request.method == "GET":
        serializer = OperationRegisterSerializer(
            operation_register,
            context={"request": request},
        )
        return Response(serializer.data, status=status.HTTP_200_OK)

    payload = _copy_request_payload(request)
    if "jobCardId" not in payload:
        payload["jobCardId"] = operation_register.jobCard_id

    serializer = OperationRegisterSerializer(
        operation_register,
        data=payload,
        partial=True,
        context={"request": request},
    )
    if not serializer.is_valid():
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    serializer.save()
    response_serializer = OperationRegisterSerializer(
        serializer.instance,
        context={"request": request},
    )
    return Response(
        {
            "message": "Operation register updated successfully.",
            "data": response_serializer.data,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
def operation_register_assign_work(request, id):
    _, _, auth_error = _authorize_request(
        request,
        ROLE_HOD,
        message="Only HOD can assign work to Site Engineer.",
    )
    if auth_error is not None:
        return auth_error

    operation_register = get_object_or_404(
        OperationRegister.objects.select_related(
            "jobCard",
            "jobCard__purchaseOrder",
            "jobCard__purchaseOrder__quotation",
            "jobCard__purchaseOrder__quotation__salesServiceRequest",
            "jobCard__quotation",
            "jobCard__quotation__salesServiceRequest",
        ),
        id=id,
    )

    if operation_register.assignedToSiteEngineer:
        return Response(
            {"error": "This operation register is already assigned to Site Engineer."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    operation_register.assignedToSiteEngineer = True
    operation_register.save(update_fields=["assignedToSiteEngineer"])
    serializer = OperationRegisterSerializer(
        operation_register,
        context={"request": request},
    )
    return Response(
        {
            "message": "Work assigned to Site Engineer successfully.",
            "data": serializer.data,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET", "POST"])
def opening_stock_snapshot(request):
    _, _, auth_error = _authorize_request(
        request,
        ROLE_ADMIN,
        message="Only administrators can manage opening stock.",
    )
    if auth_error is not None:
        return auth_error

    if request.method == "GET":
        return Response(_build_opening_stock_response(_get_latest_opening_stock()))

    errors, payload = _normalise_opening_stock_payload(request.data)
    if errors:
        return Response(errors, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        opening_stock = OpeningStock.objects.create(
            date=payload["date"],
            code=payload["code"],
        )
        OpeningStockRow.objects.bulk_create(
            [
                OpeningStockRow(
                    opening_stock=opening_stock,
                    item=row["item"],
                    itemCode=row["itemCode"],
                    itemName=row["itemName"],
                    unit=row["unit"],
                    quantity=row["quantity"],
                )
                for row in payload["rows"]
            ]
        )

    opening_stock = (
        OpeningStock.objects.prefetch_related("rows__item")
        .filter(id=opening_stock.id)
        .first()
    )
    return Response(
        {
            "message": "Opening stock saved successfully",
            "data": _build_opening_stock_response(opening_stock),
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
def opening_stock_available(request):
    _, _, auth_error = _authorize_request(
        request,
        ROLE_ADMIN,
        message="Only administrators can view opening stock.",
    )
    if auth_error is not None:
        return auth_error

    exclude_item_id = _to_int(request.query_params.get("exclude_item_id"), None)
    if exclude_item_id is not None and exclude_item_id <= 0:
        exclude_item_id = None

    return Response(_build_available_opening_stock(exclude_item_id=exclude_item_id))


@api_view(["DELETE"])
def delete_item(request, id):
    _, _, auth_error = _authorize_request(
        request,
        ROLE_ADMIN,
        message="Only administrators can delete invoice items.",
    )
    if auth_error is not None:
        return auth_error

    item = get_object_or_404(Item, id=id)
    item.delete()
    return Response({"message": "Item deleted"})


@api_view(["PUT"])
def update_item(request, id):
    _, _, auth_error = _authorize_request(
        request,
        ROLE_ADMIN,
        message="Only administrators can update invoice items.",
    )
    if auth_error is not None:
        return auth_error

    item = get_object_or_404(Item, id=id)
    stock_error = _validate_available_stock_or_none(request.data, exclude_item_id=id)
    if stock_error is not None:
        return stock_error

    serializer = ItemSerializer(item, data=request.data)

    if serializer.is_valid():
        serializer.save()
        return Response(serializer.data)

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["POST"])
def save_dispatch_summary(request):
    _, _, auth_error = _authorize_request(
        request,
        ROLE_ADMIN,
        message="Only administrators can save dispatch summaries.",
    )
    if auth_error is not None:
        return auth_error

    dispatch = request.data.get("dispatch")
    summary = request.data.get("summary")

    if not isinstance(dispatch, dict) or not isinstance(summary, dict):
        return Response(
            {"error": "Both dispatch and summary payloads are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    currency = _normalise_currency(request.data.get("currency") or dispatch.get("currency") or {})

    serializer = DispatchSummarySerializer(
        data={
            "supplierRef": dispatch.get("supplierRef"),
            "dispatchDocNo": dispatch.get("dispatchDocNo"),
            "destination": dispatch.get("destination"),
            "creditDays": dispatch.get("creditDays"),
            "dispatchThrough": dispatch.get("dispatchThrough"),
            "remarks": dispatch.get("remarks", ""),
            "termsType": dispatch.get("termsType"),
            "terms": dispatch.get("terms"),
            "taxable": summary.get("taxable"),
            "tax": summary.get("tax"),
            "discount": summary.get("discount", 0),
            "subtotal": summary.get("subtotal", 0),
            "roundoff": summary.get("roundoff", 0),
            "net": summary.get("net"),
            "currencyName": currency["name"],
            "currencyCode": currency["code"],
            "currencySymbol": currency["symbol"],
            "currencyRateToInr": currency["rateToInr"],
            "currencyAmountLabel": currency["amountLabel"],
        }
    )

    if serializer.is_valid():
        serializer.save()
        return Response(
            {"message": "Saved successfully", "data": serializer.data},
            status=status.HTTP_201_CREATED,
        )

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["POST"])
def admin_login(request):
    _ensure_default_admin()
    _ensure_default_workflow_users()

    username = str(request.data.get("username", "")).strip()
    password = request.data.get("password", "")

    if not username or not password:
        return Response(
            {"error": "Login name and password are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = authenticate(username=username, password=password)
    if not _is_authorized_workflow_user(user):
        return Response(
            {"error": "Invalid credentials."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    return Response(_build_admin_auth_payload(user), status=status.HTTP_200_OK)


@api_view(["POST"])
def verify_admin(request):
    token = str(request.data.get("token", "")).strip()
    if not token:
        return Response(
            {"error": "Auth token is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        token_data = _decode_admin_token(token)
    except signing.BadSignature:
        return Response(
            {"error": "Invalid or expired auth token."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    user = get_user_model().objects.filter(id=token_data.get("id")).first()
    if (
        not _is_authorized_workflow_user(user)
        or user.get_username() != token_data.get("username")
    ):
        return Response(
            {"error": "Access is no longer valid."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    return Response(
        {
            "authenticated": True,
            "user": _build_admin_user_payload(user),
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET", "POST"])
def users_collection(request):
    user, roles, error_response = _authorize_request(request, ROLE_ADMIN)
    if error_response is not None:
        return error_response

    User = get_user_model()

    if request.method == "GET":
        users = User.objects.filter(is_superuser=False).prefetch_related("groups")
        return Response([_build_admin_user_payload(u) for u in users] + [_build_admin_user_payload(User.objects.filter(is_superuser=True).first()) if User.objects.filter(is_superuser=True).first() else {}])

    if request.method == "POST":
        payload = _copy_request_payload(request)
        username = str(payload.get("username") or "").strip()
        password = str(payload.get("password") or "").strip()
        role = str(payload.get("role") or "").strip()

        if not username or not password or not role:
            return Response(
                {"error": "Username, password, and role are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if User.objects.filter(username=username).exists():
            return Response(
                {"error": "User with this username already exists."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        group = Group.objects.filter(name=role).first()
        if not group:
            return Response(
                {"error": "Invalid role specified."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            new_user = User.objects.create_user(
                username=username,
                password=password,
                is_active=payload.get("isActive", True),
            )
            new_user.groups.add(group)

        return Response(_build_admin_user_payload(new_user), status=status.HTTP_201_CREATED)


@api_view(["PUT", "DELETE"])
def user_detail(request, id):
    user, roles, error_response = _authorize_request(request, ROLE_ADMIN)
    if error_response is not None:
        return error_response

    User = get_user_model()
    target_user = get_object_or_404(User, id=id)

    if request.method == "DELETE":
        if target_user.is_superuser or target_user == user:
            return Response(
                {"error": "Cannot delete this user."},
                status=status.HTTP_403_FORBIDDEN,
            )
        target_user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    if request.method == "PUT":
        if target_user.is_superuser and target_user != user:
            return Response(
                {"error": "Cannot modify another superuser."},
                status=status.HTTP_403_FORBIDDEN,
            )

        payload = _copy_request_payload(request)
        username = str(payload.get("username") or "").strip()
        password = str(payload.get("password") or "").strip()
        role = str(payload.get("role") or "").strip()
        is_active = payload.get("isActive")

        if username and username != target_user.username:
            if User.objects.filter(username=username).exists():
                return Response(
                    {"error": "Username is already taken."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            target_user.username = username

        if password:
            target_user.set_password(password)

        if is_active is not None and target_user != user:
            target_user.is_active = bool(is_active)

        if role and not target_user.is_superuser:
            group = Group.objects.filter(name=role).first()
            if group:
                target_user.groups.clear()
                target_user.groups.add(group)
            else:
                return Response(
                    {"error": "Invalid role specified."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        target_user.save()
        return Response(_build_admin_user_payload(target_user))
