import base64
import json
import re
from datetime import date, timedelta
from functools import lru_cache
from io import BytesIO
from pathlib import Path

from django.conf import settings
from django.contrib.auth import authenticate, get_user_model
from django.core import signing
from django.db import transaction
from django.db.models import Sum
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
    OpeningStock,
    OpeningStockRow,
    SalesServiceRequest,
)
from .serializers import (
    CostEstimationRateSerializer,
    CostEstimationSheetSerializer,
    DispatchSummarySerializer,
    ItemFolderSerializer,
    ItemSerializer,
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
COST_ESTIMATION_SECTION_ORDER = (
    "raw_material",
    "manufacturing",
    "labor",
    "testing",
    "packaging",
    "overhead",
)
SALES_SERVICE_PARSER_CLASSES = (MultiPartParser, FormParser, JSONParser)


def _read(source, key, default=""):
    if isinstance(source, dict):
        return source.get(key, default)
    return getattr(source, key, default)


def _is_admin_user(user):
    return bool(user and user.is_active and (user.is_staff or user.is_superuser))


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


def _build_admin_auth_payload(user):
    user_payload = {
        "id": user.id,
        "username": user.get_username(),
        "isStaff": user.is_staff,
        "isSuperuser": user.is_superuser,
    }

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


@api_view(["POST"])
def add_item(request):
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
    items = Item.objects.all().order_by("-id")
    serializer = ItemSerializer(items, many=True)
    return Response(serializer.data)


@api_view(["GET", "POST"])
def itemfolder_collection(request):
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
    return Response({"itemCode": _generate_next_itemfolder_code()})


@api_view(["GET"])
def sales_service_next_reference(request):
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
        sales_service_requests = SalesServiceRequest.objects.all().order_by("-created_at", "-id")
        serializer = SalesServiceRequestSerializer(
            sales_service_requests,
            many=True,
            context={"request": request},
        )
        return Response(serializer.data)

    request_date = _parse_iso_date(request.data.get("requestDate")) or date.today()
    payload = _copy_request_payload(request, file_field_names=("clientImage",))
    payload["requestDate"] = request_date.isoformat()
    payload["referenceNo"] = _generate_next_sales_service_reference(request_date)
    if "isActive" not in payload:
        payload["isActive"] = True
    serializer = SalesServiceRequestSerializer(data=payload, context={"request": request})

    if serializer.is_valid():
        serializer.save()
        return Response(
            {
                "message": "Sales and service request saved successfully",
                "data": serializer.data,
            },
            status=status.HTTP_201_CREATED,
        )

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["GET", "PUT", "DELETE"])
@parser_classes(SALES_SERVICE_PARSER_CLASSES)
def sales_service_detail(request, id):
    sales_service_request = get_object_or_404(SalesServiceRequest, id=id)

    if request.method == "GET":
        serializer = SalesServiceRequestSerializer(
            sales_service_request,
            context={"request": request},
        )
        return Response(serializer.data)

    if request.method == "DELETE":
        sales_service_request.delete()
        return Response({"message": "Sales and service request deleted"})

    payload = _copy_request_payload(request, file_field_names=("clientImage",))
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
        serializer.save()
        return Response(serializer.data)

    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(["GET"])
def cost_estimation_catalog(request):
    references = list(
        SalesServiceRequest.objects.all()
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
        .prefetch_related("rows")
    )
    workflow = str(workflow or "").strip().lower()

    if workflow == "hod":
        queryset = queryset.filter(sentToHead=True)
    elif workflow == "md":
        queryset = queryset.filter(
            sentToHead=True,
            hodStatus=CostEstimationSheet.APPROVAL_APPROVED,
        )

    return queryset.order_by("-created_at", "-id")


@api_view(["GET", "POST"])
def cost_estimation_sheet_collection(request):
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
    sheet = get_object_or_404(
        CostEstimationSheet.objects.select_related("salesServiceRequest").prefetch_related("rows"),
        id=id,
    )

    if request.method == "GET":
        serializer = CostEstimationSheetSerializer(sheet)
        return Response(serializer.data)

    if request.method == "DELETE":
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
    sheet = get_object_or_404(
        CostEstimationSheet.objects.select_related("salesServiceRequest").prefetch_related("rows"),
        id=id,
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


@api_view(["GET", "POST"])
def opening_stock_snapshot(request):
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
    exclude_item_id = _to_int(request.query_params.get("exclude_item_id"), None)
    if exclude_item_id is not None and exclude_item_id <= 0:
        exclude_item_id = None

    return Response(_build_available_opening_stock(exclude_item_id=exclude_item_id))


@api_view(["DELETE"])
def delete_item(request, id):
    item = get_object_or_404(Item, id=id)
    item.delete()
    return Response({"message": "Item deleted"})


@api_view(["PUT"])
def update_item(request, id):
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

    username = str(request.data.get("username", "")).strip()
    password = request.data.get("password", "")

    if not username or not password:
        return Response(
            {"error": "Login name and password are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = authenticate(username=username, password=password)
    if not _is_admin_user(user):
        return Response(
            {"error": "Invalid admin credentials."},
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
    if not _is_admin_user(user) or user.get_username() != token_data.get("username"):
        return Response(
            {"error": "Admin access is no longer valid."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    return Response(
        {
            "authenticated": True,
            "user": {
                "id": user.id,
                "username": user.get_username(),
                "isStaff": user.is_staff,
                "isSuperuser": user.is_superuser,
            },
        },
        status=status.HTTP_200_OK,
    )
