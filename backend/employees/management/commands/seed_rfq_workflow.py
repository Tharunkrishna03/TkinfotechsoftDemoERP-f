from datetime import date, timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from employees.models import CostEstimationSheet
from employees.serializers import CostEstimationSheetSerializer, SalesServiceRequestSerializer
from employees.views import (
    _generate_next_cost_estimation_number,
    _generate_next_sales_service_reference,
)


DEFAULT_RFQ_TEMPLATE = {
    "modeOfContact": "",
    "emailReferenceNumber": "MARINE-REF-DUPLICATE",
    "clientName": "Port Engineer",
    "companyName": "Gulf Marine Operations",
    "phoneNo": "9876543210",
    "email": "port.engineer@example.com",
    "itemName": "Ship & Yard Repair Job",
    "quantity": 1,
    "unit": "Job",
    "paymentTerms": "50% Advance",
    "taxPreference": "VAT Extra",
    "deliveryLocation": "Jebel Ali",
    "deliveryMode": "Service Mobilization",
    "isActive": True,
}

DEFAULT_COST_ESTIMATION_ROWS = [
    {
        "section": "raw_material",
        "itemName": "Marine Zinc Anodes",
        "secondaryLabel": "Category",
        "secondaryValue": "Cathodic Protection",
        "unit": "pcs",
        "rate": 1850,
        "quantity": 2,
        "total": 3700,
        "displayOrder": 1,
    },
    {
        "section": "manufacturing",
        "itemName": "Ship & Yard Repair Works",
        "secondaryLabel": "Machine Used",
        "secondaryValue": "Dockside Repair Team",
        "unit": "hr",
        "rate": 1850,
        "quantity": 6,
        "total": 11100,
        "displayOrder": 2,
    },
    {
        "section": "labor",
        "itemName": "Marine Service Engineer",
        "secondaryLabel": "",
        "secondaryValue": "",
        "unit": "Hour",
        "rate": 320,
        "quantity": 8,
        "total": 2560,
        "displayOrder": 3,
    },
    {
        "section": "packaging",
        "itemName": "Heavy Equipment Mobilization",
        "secondaryLabel": "",
        "secondaryValue": "",
        "unit": "trip",
        "rate": 2400,
        "quantity": 1,
        "total": 2400,
        "displayOrder": 4,
    },
]


class Command(BaseCommand):
    help = (
        "Create duplicate RFQ sample data, create linked cost estimations, and "
        "send them into the HOD approval workflow."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--count",
            type=int,
            default=5,
            help="Number of duplicate RFQ workflow records to create. Default: 5",
        )
        parser.add_argument(
            "--request-date",
            type=str,
            default="",
            help="Optional request date in YYYY-MM-DD format. Default: today",
        )

    def handle(self, *args, **options):
        count = int(options["count"] or 0)
        request_date = self._parse_request_date(options.get("request_date") or "")

        if count <= 0:
            raise CommandError("Count must be greater than 0.")

        created_records = []

        with transaction.atomic():
            for _ in range(count):
                sales_request = self._create_sales_request(request_date)
                sheet = self._create_cost_estimation_sheet(sales_request.id, request_date)
                self._send_sheet_to_hod(sheet)
                created_records.append((sales_request.referenceNo, sheet.costEstimationNo))

        self.stdout.write(
            self.style.SUCCESS(
                f"Created {len(created_records)} RFQ workflow records and sent them to HOD approval."
            )
        )
        for index, (reference_no, cost_estimation_no) in enumerate(created_records, start=1):
            self.stdout.write(
                f"{index}. RFQ {reference_no} -> Cost Estimation {cost_estimation_no} -> HOD Pending"
            )

    def _parse_request_date(self, value):
        if not value:
            return date.today()

        try:
            return date.fromisoformat(value)
        except ValueError as error:
            raise CommandError("Request date must be in YYYY-MM-DD format.") from error

    def _create_sales_request(self, request_date):
        payload = {
            **DEFAULT_RFQ_TEMPLATE,
            "referenceNo": _generate_next_sales_service_reference(request_date),
            "requestDate": request_date.isoformat(),
            "requiredDeliveryDate": (request_date + timedelta(days=10)).isoformat(),
        }
        serializer = SalesServiceRequestSerializer(data=payload)
        if not serializer.is_valid():
            raise CommandError(f"Failed to create RFQ data: {serializer.errors}")
        return serializer.save()

    def _create_cost_estimation_sheet(self, sales_service_request_id, request_date):
        serializer = CostEstimationSheetSerializer(
            data={
                "salesServiceRequestId": sales_service_request_id,
                "taxPercentage": 18,
                "profitMarginPercentage": 10,
                "rows": DEFAULT_COST_ESTIMATION_ROWS,
            }
        )
        if not serializer.is_valid():
            raise CommandError(f"Failed to create cost estimation data: {serializer.errors}")

        return serializer.save(
            costEstimationNo=_generate_next_cost_estimation_number(request_date),
        )

    def _send_sheet_to_hod(self, sheet):
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
