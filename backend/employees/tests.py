import json
from io import StringIO
from datetime import date

from django.core.management import call_command
from django.test import TestCase, override_settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.template.loader import render_to_string
from rest_framework.test import APIClient

from .models import (
    CostEstimationRate,
    CostEstimationSheet,
    CostEstimationSheetRow,
    DispatchSummary,
    Item,
    ItemFolder,
    OpeningStock,
    OpeningStockRow,
    Quotation,
    SalesServiceRequest,
)
from .views import _build_invoice_context


@override_settings(ALLOWED_HOSTS=["testserver", "localhost", "127.0.0.1"], STATICFILES_DIRS=[])
class EmployeeApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.item_payload = {
            "ledger": "VELAV GARMENTS INDIA PVT LTD",
            "bill_type": "Tax Invoice",
            "date": "2026-03-20",
            "code": "INV-1001",
            "item_code": "EL-001",
            "item_name": "Rubber Elastic",
            "unit": "MTR",
            "quantity": 10,
            "rate": 45.5,
            "discount": 5,
            "description": "Elastic tape supply",
            "amount": 432.25,
        }
        self.dispatch_payload = {
            "dispatch": {
                "supplierRef": "PO-7788",
                "dispatchDocNo": "DC-7788",
                "destination": "Tiruppur",
                "creditDays": 15,
                "dispatchThrough": "Speed post",
                "remarks": "Handle with care",
                "termsType": "Payment Terms",
                "terms": "Net 15 days",
            },
            "summary": {
                "taxable": 432.25,
                "tax": 77.81,
                "discount": 22.75,
                "subtotal": 432.25,
                "roundoff": -0.06,
                "net": 510.0,
            },
            "currency": {
                "name": "Oman",
                "code": "OMR",
                "symbol": "OMR",
                "rateToInr": 213.57,
                "amountLabel": "Rials",
            },
        }
        self.itemfolder_payload = {
            "itemCode": "ITEM06",
            "unit": "Nos",
            "mrp": 1250.5,
            "itemType": "Finished Goods",
            "hsnCode": "8536",
            "purchasePrice": 750.25,
            "itemName": "Starter Panel",
            "tax": "18%",
            "salesPrice": 1100.75,
            "categoryName": "Electrical",
            "partNo": "SP-001",
            "minimumOrderQty": 2,
            "itemGroup": "General",
            "batchNo": "BATCH-01",
            "minimumStockQty": 5,
            "itemDescription": "Three phase starter panel",
            "isStock": True,
            "needQc": True,
            "needWarranty": False,
            "isActive": True,
            "needService": False,
            "needSerialNo": True,
        }
        self.sales_service_payload = {
            "emailReferenceNumber": "MAIL-REF-1001",
            "requestDate": "2026-03-26",
            "requiredDeliveryDate": "2026-04-05",
            "clientName": "Arun Kumar",
            "companyName": "Acme Industries",
            "phoneNo": "9876543210",
            "email": "arun@example.com",
            "itemName": "Starter Panel",
            "quantity": 5,
            "unit": "Nos",
            "paymentTerms": "Advance",
            "taxPreference": "GST Extra",
            "deliveryLocation": "Tiruppur",
            "deliveryMode": "Courier",
        }
        self.sales_service_manufacturing_payload = {
            **self.sales_service_payload,
            "modeOfContact": "phone",
            "emailReferenceNumber": "",
            "email": "",
            "requestType": "manufacturing",
            "batteryServices": [],
            "manufacturingItems": [
                {
                    "itemName": "Starter Panel",
                    "quantity": 5,
                    "unit": "Nos",
                }
            ],
        }
        self.sales_service_service_payload = {
            **self.sales_service_payload,
            "modeOfContact": "email",
            "phoneNo": "",
            "requestType": "service",
            "batteryServices": [
                "Battery Inspection",
                "Battery Testing",
            ],
            "manufacturingItems": [],
            "itemName": "",
            "quantity": 0,
            "unit": "",
        }

    def create_opening_stock_snapshot(self, quantity=20):
        itemfolder = ItemFolder.objects.create(
            **{
                **self.itemfolder_payload,
                "itemCode": self.item_payload["item_code"],
                "itemName": self.item_payload["item_name"],
                "unit": self.item_payload["unit"],
                "minimumStockQty": quantity,
            }
        )
        opening_stock = OpeningStock.objects.create(date="24-03-2026", code="OPEN-001")
        OpeningStockRow.objects.create(
            opening_stock=opening_stock,
            item=itemfolder,
            itemCode=itemfolder.itemCode,
            itemName=itemfolder.itemName,
            unit=itemfolder.unit,
            quantity=quantity,
        )
        return opening_stock, itemfolder

    def create_cost_estimation_sheet(self):
        create_response = self.client.post(
            "/api/sales-service/",
            self.sales_service_payload,
            format="json",
        )
        self.assertEqual(create_response.status_code, 201)
        request_id = create_response.data["data"]["id"]

        save_response = self.client.post(
            "/api/cost-estimation/sheets/",
            {
                "salesServiceRequestId": request_id,
                "taxPercentage": 18,
                "profitMarginPercentage": 10,
                "rows": [
                    {
                        "section": "raw_material",
                        "itemName": "Lithium",
                        "secondaryLabel": "Category",
                        "secondaryValue": "Chemical",
                        "unit": "kg",
                        "rate": 1200,
                        "quantity": 2,
                        "total": 2400,
                        "displayOrder": 1,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(save_response.status_code, 201)
        return save_response.data["data"]

    def test_add_item_creates_record(self):
        self.create_opening_stock_snapshot()
        response = self.client.post("/add-item/", self.item_payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Item.objects.count(), 1)

    def test_add_item_rejects_invalid_payload(self):
        response = self.client.post("/add-item/", {}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_add_item_rejects_quantity_above_available_opening_stock(self):
        self.create_opening_stock_snapshot(quantity=5)
        payload = {**self.item_payload, "quantity": 6}
        response = self.client.post("/add-item/", payload, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("quantity", response.data)

    def test_add_item_rejects_zero_amount(self):
        self.create_opening_stock_snapshot()
        payload = {**self.item_payload, "amount": 0}
        response = self.client.post("/add-item/", payload, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("amount", response.data)

    def test_update_item_updates_record(self):
        self.create_opening_stock_snapshot()
        item = Item.objects.create(**self.item_payload)
        payload = {**self.item_payload, "item_name": "Updated Elastic"}
        response = self.client.put(f"/update-item/{item.id}/", payload, format="json")
        self.assertEqual(response.status_code, 200)
        item.refresh_from_db()
        self.assertEqual(item.item_name, "Updated Elastic")

    def test_update_item_rejects_invalid_payload(self):
        item = Item.objects.create(**self.item_payload)
        response = self.client.put(f"/update-item/{item.id}/", {}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_delete_item_deletes_record(self):
        item = Item.objects.create(**self.item_payload)
        response = self.client.delete(f"/delete-item/{item.id}/")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(Item.objects.filter(id=item.id).exists())

    def test_delete_item_returns_not_found(self):
        response = self.client.delete("/delete-item/999999/")
        self.assertEqual(response.status_code, 404)

    def test_itemfolder_create_accepts_flat_payload(self):
        response = self.client.post("/api/itemfolder/", self.itemfolder_payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(ItemFolder.objects.count(), 1)
        itemfolder = ItemFolder.objects.get()
        self.assertRegex(itemfolder.itemCode, r"^BA-A01-\d{4}$")
        self.assertTrue(itemfolder.needSerialNo)

    def test_itemfolder_create_accepts_nested_payload(self):
        response = self.client.post(
            "/api/itemfolder/",
            {
                "formValues": {
                    key: value
                    for key, value in self.itemfolder_payload.items()
                    if key
                    not in {
                        "isStock",
                        "needQc",
                        "needWarranty",
                        "isActive",
                        "needService",
                        "needSerialNo",
                    }
                },
                "toggles": {
                    key: value
                    for key, value in self.itemfolder_payload.items()
                    if key
                    in {
                        "isStock",
                        "needQc",
                        "needWarranty",
                        "isActive",
                        "needService",
                        "needSerialNo",
                    }
                },
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(ItemFolder.objects.count(), 1)
        itemfolder = ItemFolder.objects.get()
        self.assertEqual(itemfolder.itemName, "Starter Panel")
        self.assertTrue(itemfolder.isStock)

    def test_itemfolder_update_and_list(self):
        itemfolder = ItemFolder.objects.create(**self.itemfolder_payload)
        update_response = self.client.put(
            f"/api/itemfolder/{itemfolder.id}/",
            {"itemName": "Updated Starter Panel", "minimumStockQty": 8},
            format="json",
        )
        self.assertEqual(update_response.status_code, 200)
        itemfolder.refresh_from_db()
        self.assertEqual(itemfolder.itemName, "Updated Starter Panel")
        self.assertEqual(itemfolder.minimumStockQty, 8)

        list_response = self.client.get("/api/itemfolder/")
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(len(list_response.data), 1)

    def test_sales_service_next_reference_returns_first_reference(self):
        response = self.client.get("/api/sales-service/next-reference/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data["referenceNo"],
            f"RF-{date.today().strftime('%y')}-0001",
        )

    def test_sales_service_create_generates_incrementing_reference(self):
        first_response = self.client.post(
            "/api/sales-service/",
            self.sales_service_payload,
            format="json",
        )
        self.assertEqual(first_response.status_code, 201)
        self.assertEqual(SalesServiceRequest.objects.count(), 1)
        self.assertEqual(first_response.data["data"]["referenceNo"], "RF-26-0001")
        self.assertEqual(
            first_response.data["data"]["emailReferenceNumber"],
            "MAIL-REF-1001",
        )

        second_response = self.client.post(
            "/api/sales-service/",
            self.sales_service_payload,
            format="json",
        )
        self.assertEqual(second_response.status_code, 201)
        self.assertEqual(SalesServiceRequest.objects.count(), 2)
        self.assertEqual(second_response.data["data"]["referenceNo"], "RF-26-0002")

    def test_sales_service_email_reference_number_is_optional(self):
        payload = {**self.sales_service_payload}
        payload.pop("emailReferenceNumber")

        response = self.client.post("/api/sales-service/", payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["data"]["emailReferenceNumber"], "")

    def test_sales_service_create_accepts_pdf_attachment(self):
        payload = {
            **self.sales_service_payload,
            "clientImage": SimpleUploadedFile(
                "client-document.pdf",
                b"filecontent",
                content_type="application/pdf",
            ),
        }

        response = self.client.post("/api/sales-service/", payload)
        self.assertEqual(response.status_code, 201)
        self.assertIn("sales-service/", response.data["data"]["clientImage"])
        self.assertTrue(response.data["data"]["isActive"])

    @override_settings(FILE_UPLOAD_MAX_MEMORY_SIZE=1)
    def test_sales_service_explicit_multipart_create_and_update_accept_pdf_attachment(self):
        large_pdf_content = b"%PDF-1.4\n" + (b"0" * 4096)

        create_response = self.client.post(
            "/api/sales-service/",
            {
                **self.sales_service_payload,
                "clientImage": SimpleUploadedFile(
                    "client-document.pdf",
                    large_pdf_content,
                    content_type="application/pdf",
                ),
            },
            format="multipart",
        )
        self.assertEqual(create_response.status_code, 201)
        self.assertIn("sales-service/", create_response.data["data"]["clientImage"])

        request_id = create_response.data["data"]["id"]
        update_response = self.client.put(
            f"/api/sales-service/{request_id}/",
            {
                "clientName": "Updated Client",
                "clientImage": SimpleUploadedFile(
                    "updated-client-document.pdf",
                    large_pdf_content,
                    content_type="application/pdf",
                ),
            },
            format="multipart",
        )
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.data["clientName"], "Updated Client")
        self.assertIn("sales-service/", update_response.data["clientImage"])

    def test_sales_service_list_returns_pdf_attachment_urls(self):
        create_response = self.client.post(
            "/api/sales-service/",
            {
                **self.sales_service_payload,
                "clientImage": SimpleUploadedFile(
                    "client-document.pdf",
                    b"filecontent",
                    content_type="application/pdf",
                ),
            },
        )
        self.assertEqual(create_response.status_code, 201)

        list_response = self.client.get("/api/sales-service/")
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(len(list_response.data), 1)
        self.assertIn("sales-service/", list_response.data[0]["clientImage"])

    def test_sales_service_list_excludes_requests_after_cost_estimation_created(self):
        create_response = self.client.post(
            "/api/sales-service/",
            self.sales_service_payload,
            format="json",
        )
        request_id = create_response.data["data"]["id"]

        initial_list_response = self.client.get("/api/sales-service/")
        self.assertEqual(initial_list_response.status_code, 200)
        self.assertEqual(len(initial_list_response.data), 1)

        save_response = self.client.post(
            "/api/cost-estimation/sheets/",
            {
                "salesServiceRequestId": request_id,
                "taxPercentage": 18,
                "profitMarginPercentage": 10,
                "rows": [
                    {
                        "section": "raw_material",
                        "itemName": "Lithium",
                        "secondaryLabel": "Category",
                        "secondaryValue": "Chemical",
                        "unit": "kg",
                        "rate": 1200,
                        "quantity": 2,
                        "total": 2400,
                        "displayOrder": 1,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(save_response.status_code, 201)

        filtered_list_response = self.client.get("/api/sales-service/")
        self.assertEqual(filtered_list_response.status_code, 200)
        self.assertEqual(filtered_list_response.data, [])

    def test_sales_service_create_supports_phone_contact_and_manufacturing_items(self):
        itemfolder = ItemFolder.objects.create(**self.itemfolder_payload)
        payload = {
            **self.sales_service_manufacturing_payload,
            "manufacturingItems": json.dumps(
                [
                    {
                        "itemId": itemfolder.id,
                        "quantity": 5,
                    }
                ]
            ),
            "clientImage": SimpleUploadedFile(
                "call-screenshot.png",
                b"imagecontent",
                content_type="image/png",
            ),
        }

        response = self.client.post("/api/sales-service/", payload, format="multipart")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["data"]["modeOfContact"], "phone")
        self.assertEqual(response.data["data"]["requestType"], "manufacturing")
        self.assertEqual(response.data["data"]["phoneNo"], "9876543210")
        self.assertEqual(response.data["data"]["email"], "")
        self.assertEqual(response.data["data"]["itemName"], "Starter Panel")
        self.assertEqual(response.data["data"]["quantity"], 5)
        self.assertEqual(response.data["data"]["unit"], "Nos")
        self.assertEqual(len(response.data["data"]["manufacturingItems"]), 1)
        self.assertEqual(
            response.data["data"]["manufacturingItems"][0]["itemName"],
            "Starter Panel",
        )

    def test_sales_service_create_supports_email_contact_and_service_scope(self):
        payload = {
            **self.sales_service_service_payload,
            "batteryServices": json.dumps(self.sales_service_service_payload["batteryServices"]),
            "clientImage": SimpleUploadedFile(
                "mail-reference.pdf",
                b"%PDF-1.4\nservice",
                content_type="application/pdf",
            ),
        }

        response = self.client.post("/api/sales-service/", payload, format="multipart")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["data"]["modeOfContact"], "email")
        self.assertEqual(response.data["data"]["requestType"], "service")
        self.assertEqual(response.data["data"]["phoneNo"], "")
        self.assertEqual(
            response.data["data"]["batteryServices"],
            self.sales_service_service_payload["batteryServices"],
        )
        self.assertEqual(
            response.data["data"]["scopeArea"],
            "Battery Inspection\nBattery Testing",
        )
        self.assertEqual(response.data["data"]["manufacturingItems"], [])

    def test_sales_service_create_supports_service_only_payload_without_commercial_fields(self):
        payload = {
            "requestDate": "2026-03-26",
            "clientName": "Arun Kumar",
            "companyName": "Acme Industries",
            "modeOfContact": "phone",
            "phoneNo": "9876543210",
            "requestType": "service",
            "batteryServices": json.dumps(
                [
                    "Battery Inspection",
                    "Battery Testing",
                ]
            ),
            "clientImage": SimpleUploadedFile(
                "call-screenshot.png",
                b"imagecontent",
                content_type="image/png",
            ),
        }

        response = self.client.post("/api/sales-service/", payload, format="multipart")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["data"]["modeOfContact"], "phone")
        self.assertEqual(response.data["data"]["requestType"], "service")
        self.assertEqual(response.data["data"]["requiredDeliveryDate"], "2026-03-26")
        self.assertEqual(response.data["data"]["paymentTerms"], "")
        self.assertEqual(response.data["data"]["taxPreference"], "")
        self.assertEqual(response.data["data"]["deliveryLocation"], "")
        self.assertEqual(response.data["data"]["deliveryMode"], "")
        self.assertEqual(
            response.data["data"]["scopeArea"],
            "Battery Inspection\nBattery Testing",
        )

    def test_sales_service_phone_mode_rejects_non_image_attachment(self):
        payload = {
            **self.sales_service_manufacturing_payload,
            "manufacturingItems": json.dumps(self.sales_service_manufacturing_payload["manufacturingItems"]),
            "clientImage": SimpleUploadedFile(
                "call-reference.pdf",
                b"%PDF-1.4\ncontent",
                content_type="application/pdf",
            ),
        }

        response = self.client.post("/api/sales-service/", payload, format="multipart")
        self.assertEqual(response.status_code, 400)
        self.assertIn("clientImage", response.data)

    def test_sales_service_create_rejects_non_pdf_attachment(self):
        payload = {
            **self.sales_service_payload,
            "clientImage": SimpleUploadedFile(
                "client-logo.png",
                b"filecontent",
                content_type="image/png",
            ),
        }

        response = self.client.post("/api/sales-service/", payload)
        self.assertEqual(response.status_code, 400)
        self.assertIn("clientImage", response.data)

    def test_sales_service_detail_update_and_delete(self):
        create_response = self.client.post(
            "/api/sales-service/",
            self.sales_service_payload,
            format="json",
        )
        request_id = create_response.data["data"]["id"]

        update_response = self.client.put(
            f"/api/sales-service/{request_id}/",
            {
                "clientName": "Updated Client",
                "isActive": False,
            },
            format="json",
        )
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.data["clientName"], "Updated Client")
        self.assertFalse(update_response.data["isActive"])

        delete_response = self.client.delete(f"/api/sales-service/{request_id}/")
        self.assertEqual(delete_response.status_code, 200)
        self.assertFalse(SalesServiceRequest.objects.filter(id=request_id).exists())

    def test_sales_service_multipart_update_preserves_status_when_is_active_missing(self):
        create_response = self.client.post(
            "/api/sales-service/",
            self.sales_service_payload,
            format="json",
        )
        request_id = create_response.data["data"]["id"]

        pdf_payload = {
            "clientName": "Pdf Updated Client",
            "clientImage": SimpleUploadedFile(
                "client-document.pdf",
                b"filecontent",
                content_type="application/pdf",
            ),
        }

        response = self.client.put(
            f"/api/sales-service/{request_id}/",
            pdf_payload,
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["clientName"], "Pdf Updated Client")
        self.assertTrue(response.data["isActive"])

    def test_cost_estimation_catalog_returns_references_and_seeded_sections(self):
        create_response = self.client.post(
            "/api/sales-service/",
            self.sales_service_payload,
            format="json",
        )
        self.assertEqual(create_response.status_code, 201)
        self.assertEqual(CostEstimationRate.objects.count(), 27)

        response = self.client.get("/api/cost-estimation/catalog/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["references"]), 1)
        self.assertEqual(response.data["references"][0]["referenceNo"], "RF-26-0001")
        self.assertEqual(response.data["references"][0]["clientName"], "Arun Kumar")
        self.assertEqual(len(response.data["sections"]["raw_material"]), 7)
        self.assertEqual(len(response.data["sections"]["manufacturing"]), 5)
        self.assertEqual(len(response.data["sections"]["labor"]), 3)
        self.assertEqual(len(response.data["sections"]["testing"]), 4)
        self.assertEqual(len(response.data["sections"]["packaging"]), 4)
        self.assertEqual(len(response.data["sections"]["overhead"]), 4)
        first_raw_material = (
            CostEstimationRate.objects.filter(section="raw_material")
            .order_by("displayOrder", "id")
            .first()
        )
        self.assertIsNotNone(first_raw_material)
        self.assertEqual(
            response.data["sections"]["raw_material"][0]["itemName"],
            first_raw_material.itemName,
        )
        self.assertEqual(
            response.data["sections"]["raw_material"][0]["secondaryValue"],
            first_raw_material.secondaryValue,
        )

    def test_cost_estimation_catalog_excludes_existing_request_but_keeps_current_edit_reference(self):
        create_response = self.client.post(
            "/api/sales-service/",
            self.sales_service_payload,
            format="json",
        )
        request_id = create_response.data["data"]["id"]

        save_response = self.client.post(
            "/api/cost-estimation/sheets/",
            {
                "salesServiceRequestId": request_id,
                "taxPercentage": 18,
                "profitMarginPercentage": 10,
                "rows": [
                    {
                        "section": "raw_material",
                        "itemName": "Lithium",
                        "secondaryLabel": "Category",
                        "secondaryValue": "Chemical",
                        "unit": "kg",
                        "rate": 1200,
                        "quantity": 2,
                        "total": 2400,
                        "displayOrder": 1,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(save_response.status_code, 201)
        sheet_id = save_response.data["data"]["id"]

        response = self.client.get("/api/cost-estimation/catalog/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["references"], [])

        edit_response = self.client.get("/api/cost-estimation/catalog/", {"sheetId": sheet_id})
        self.assertEqual(edit_response.status_code, 200)
        self.assertEqual(len(edit_response.data["references"]), 1)
        self.assertEqual(edit_response.data["references"][0]["referenceNo"], "RF-26-0001")

    def test_cost_estimation_next_number_returns_first_number_for_request_year(self):
        create_response = self.client.post(
            "/api/sales-service/",
            self.sales_service_payload,
            format="json",
        )
        request_id = create_response.data["data"]["id"]

        response = self.client.get(
            "/api/cost-estimation/next-number/",
            {"salesServiceRequestId": request_id},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["costEstimationNo"], "CST-26-0001")

    def test_cost_estimation_sheet_submit_saves_rows_and_computed_totals(self):
        create_response = self.client.post(
            "/api/sales-service/",
            self.sales_service_payload,
            format="json",
        )
        request_id = create_response.data["data"]["id"]

        response = self.client.post(
            "/api/cost-estimation/sheets/",
            {
                "salesServiceRequestId": request_id,
                "taxPercentage": 18,
                "profitMarginPercentage": 10,
                "rows": [
                    {
                        "section": "raw_material",
                        "itemName": "Lithium",
                        "secondaryLabel": "Category",
                        "secondaryValue": "Chemical",
                        "unit": "kg",
                        "rate": 1200,
                        "quantity": 2,
                        "total": 2400,
                        "displayOrder": 1,
                    },
                    {
                        "section": "miscellaneous",
                        "itemName": "Tooling charge",
                        "secondaryLabel": "",
                        "secondaryValue": "",
                        "unit": "job",
                        "rate": 500,
                        "quantity": 1,
                        "total": 500,
                        "displayOrder": 2,
                    },
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(CostEstimationSheet.objects.count(), 1)
        self.assertEqual(CostEstimationSheetRow.objects.count(), 2)
        self.assertEqual(response.data["data"]["costEstimationNo"], "CST-26-0001")

        sheet = CostEstimationSheet.objects.get()
        self.assertEqual(sheet.salesServiceRequest_id, request_id)
        self.assertEqual(sheet.costEstimationNo, "CST-26-0001")
        self.assertEqual(sheet.rawMaterialTotal, 2400)
        self.assertEqual(sheet.miscellaneousTotal, 500)
        self.assertEqual(sheet.subtotal, 2900)
        self.assertEqual(sheet.taxAmount, 522)
        self.assertEqual(sheet.profitMarginAmount, 290)
        self.assertEqual(sheet.finalBatteryCost, 3712)
        self.assertEqual(sheet.costPerUnit, 742.4)

    def test_cost_estimation_sheet_list_returns_reference_and_client_details(self):
        create_response = self.client.post(
            "/api/sales-service/",
            self.sales_service_payload,
            format="json",
        )
        request_id = create_response.data["data"]["id"]

        save_response = self.client.post(
            "/api/cost-estimation/sheets/",
            {
                "salesServiceRequestId": request_id,
                "taxPercentage": 18,
                "profitMarginPercentage": 10,
                "rows": [
                    {
                        "section": "raw_material",
                        "itemName": "Lithium",
                        "secondaryLabel": "Category",
                        "secondaryValue": "Chemical",
                        "unit": "kg",
                        "rate": 1200,
                        "quantity": 2,
                        "total": 2400,
                        "displayOrder": 1,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(save_response.status_code, 201)

        response = self.client.get("/api/cost-estimation/sheets/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]["costEstimationNo"], "CST-26-0001")
        self.assertEqual(response.data[0]["referenceNo"], "RF-26-0001")
        self.assertEqual(response.data[0]["clientName"], "Arun Kumar")
        self.assertEqual(response.data[0]["companyName"], "Acme Industries")
        self.assertEqual(response.data[0]["phoneNo"], "9876543210")
        self.assertEqual(len(response.data[0]["rows"]), 1)

    def test_cost_estimation_sheet_create_rejects_duplicate_request(self):
        create_response = self.client.post(
            "/api/sales-service/",
            self.sales_service_payload,
            format="json",
        )
        request_id = create_response.data["data"]["id"]

        first_response = self.client.post(
            "/api/cost-estimation/sheets/",
            {
                "salesServiceRequestId": request_id,
                "taxPercentage": 18,
                "profitMarginPercentage": 10,
                "rows": [
                    {
                        "section": "raw_material",
                        "itemName": "Lithium",
                        "secondaryLabel": "Category",
                        "secondaryValue": "Chemical",
                        "unit": "kg",
                        "rate": 1200,
                        "quantity": 2,
                        "total": 2400,
                        "displayOrder": 1,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(first_response.status_code, 201)

        second_response = self.client.post(
            "/api/cost-estimation/sheets/",
            {
                "salesServiceRequestId": request_id,
                "taxPercentage": 18,
                "profitMarginPercentage": 10,
                "rows": [
                    {
                        "section": "raw_material",
                        "itemName": "Lithium",
                        "secondaryLabel": "Category",
                        "secondaryValue": "Chemical",
                        "unit": "kg",
                        "rate": 1000,
                        "quantity": 1,
                        "total": 1000,
                        "displayOrder": 1,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(second_response.status_code, 400)
        self.assertIn("salesServiceRequestId", second_response.data)

    def test_cost_estimation_sheet_detail_update_and_delete(self):
        create_response = self.client.post(
            "/api/sales-service/",
            self.sales_service_payload,
            format="json",
        )
        request_id = create_response.data["data"]["id"]

        save_response = self.client.post(
            "/api/cost-estimation/sheets/",
            {
                "salesServiceRequestId": request_id,
                "taxPercentage": 18,
                "profitMarginPercentage": 10,
                "rows": [
                    {
                        "section": "raw_material",
                        "itemName": "Lithium",
                        "secondaryLabel": "Category",
                        "secondaryValue": "Chemical",
                        "unit": "kg",
                        "rate": 1200,
                        "quantity": 2,
                        "total": 2400,
                        "displayOrder": 1,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(save_response.status_code, 201)
        sheet_id = save_response.data["data"]["id"]

        detail_response = self.client.get(f"/api/cost-estimation/sheets/{sheet_id}/")
        self.assertEqual(detail_response.status_code, 200)
        self.assertEqual(detail_response.data["costEstimationNo"], "CST-26-0001")
        self.assertEqual(detail_response.data["referenceNo"], "RF-26-0001")

        update_response = self.client.put(
            f"/api/cost-estimation/sheets/{sheet_id}/",
            {
                "salesServiceRequestId": request_id,
                "taxPercentage": 5,
                "profitMarginPercentage": 10,
                "rows": [
                    {
                        "section": "raw_material",
                        "itemName": "Lithium",
                        "secondaryLabel": "Category",
                        "secondaryValue": "Chemical",
                        "unit": "kg",
                        "rate": 100,
                        "quantity": 3,
                        "total": 300,
                        "displayOrder": 1,
                    },
                    {
                        "section": "miscellaneous",
                        "itemName": "Assembly charge",
                        "secondaryLabel": "",
                        "secondaryValue": "",
                        "unit": "job",
                        "rate": 50,
                        "quantity": 2,
                        "total": 100,
                        "displayOrder": 1,
                    },
                ],
            },
            format="json",
        )
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.data["costEstimationNo"], "CST-26-0001")
        self.assertEqual(update_response.data["subtotal"], 400)
        self.assertEqual(update_response.data["taxAmount"], 20)
        self.assertEqual(update_response.data["profitMarginAmount"], 40)
        self.assertEqual(update_response.data["finalBatteryCost"], 460)
        self.assertEqual(update_response.data["costPerUnit"], 92)
        self.assertEqual(len(update_response.data["rows"]), 2)

        delete_response = self.client.delete(f"/api/cost-estimation/sheets/{sheet_id}/")
        self.assertEqual(delete_response.status_code, 200)
        self.assertFalse(CostEstimationSheet.objects.filter(id=sheet_id).exists())

    def test_cost_estimation_pending_sheet_is_read_only_until_declined(self):
        sheet = self.create_cost_estimation_sheet()
        sheet_id = sheet["id"]
        request_id = SalesServiceRequest.objects.get(referenceNo=sheet["referenceNo"]).id

        self.client.post(f"/api/cost-estimation/sheets/{sheet_id}/send-to-head/")

        update_response = self.client.put(
            f"/api/cost-estimation/sheets/{sheet_id}/",
            {
                "salesServiceRequestId": request_id,
                "taxPercentage": 5,
                "profitMarginPercentage": 10,
                "rows": [
                    {
                        "section": "raw_material",
                        "itemName": "Lithium",
                        "secondaryLabel": "Category",
                        "secondaryValue": "Chemical",
                        "unit": "kg",
                        "rate": 100,
                        "quantity": 3,
                        "total": 300,
                        "displayOrder": 1,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(update_response.status_code, 400)
        self.assertIn("non_field_errors", update_response.data)

        delete_response = self.client.delete(f"/api/cost-estimation/sheets/{sheet_id}/")
        self.assertEqual(delete_response.status_code, 400)

        decline_response = self.client.post(
            f"/api/cost-estimation/sheets/{sheet_id}/review/",
            {
                "stage": "hod",
                "status": "declined",
                "comment": "Need correction",
            },
            format="json",
        )
        self.assertEqual(decline_response.status_code, 200)

        unlocked_update_response = self.client.put(
            f"/api/cost-estimation/sheets/{sheet_id}/",
            {
                "salesServiceRequestId": request_id,
                "taxPercentage": 5,
                "profitMarginPercentage": 10,
                "rows": [
                    {
                        "section": "raw_material",
                        "itemName": "Lithium",
                        "secondaryLabel": "Category",
                        "secondaryValue": "Chemical",
                        "unit": "kg",
                        "rate": 100,
                        "quantity": 3,
                        "total": 300,
                        "displayOrder": 1,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(unlocked_update_response.status_code, 200)

    def test_cost_estimation_workflow_send_to_head_and_review_filters(self):
        sheet = self.create_cost_estimation_sheet()
        sheet_id = sheet["id"]

        send_response = self.client.post(f"/api/cost-estimation/sheets/{sheet_id}/send-to-head/")
        self.assertEqual(send_response.status_code, 200)
        self.assertTrue(send_response.data["data"]["sentToHead"])
        self.assertEqual(
            send_response.data["data"]["hodStatus"],
            CostEstimationSheet.APPROVAL_PENDING,
        )

        hod_list_response = self.client.get("/api/cost-estimation/sheets/", {"workflow": "hod"})
        self.assertEqual(hod_list_response.status_code, 200)
        self.assertEqual(len(hod_list_response.data), 1)

        md_list_response = self.client.get("/api/cost-estimation/sheets/", {"workflow": "md"})
        self.assertEqual(md_list_response.status_code, 200)
        self.assertEqual(len(md_list_response.data), 0)

        hod_review_response = self.client.post(
            f"/api/cost-estimation/sheets/{sheet_id}/review/",
            {
                "stage": "hod",
                "status": "approved",
                "comment": "Approved by HOD",
            },
            format="json",
        )
        self.assertEqual(hod_review_response.status_code, 200)
        self.assertEqual(hod_review_response.data["data"]["hodStatus"], "approved")
        self.assertEqual(hod_review_response.data["data"]["hodComment"], "Approved by HOD")

        hod_list_response = self.client.get("/api/cost-estimation/sheets/", {"workflow": "hod"})
        self.assertEqual(hod_list_response.status_code, 200)
        self.assertEqual(len(hod_list_response.data), 0)

        md_list_response = self.client.get("/api/cost-estimation/sheets/", {"workflow": "md"})
        self.assertEqual(md_list_response.status_code, 200)
        self.assertEqual(len(md_list_response.data), 1)
        self.assertEqual(md_list_response.data[0]["hodComment"], "Approved by HOD")

        md_review_response = self.client.post(
            f"/api/cost-estimation/sheets/{sheet_id}/review/",
            {
                "stage": "md",
                "status": "approved",
                "comment": "Approved by MD",
            },
            format="json",
        )
        self.assertEqual(md_review_response.status_code, 200)
        self.assertEqual(md_review_response.data["data"]["mdStatus"], "approved")
        self.assertEqual(md_review_response.data["data"]["overallStatus"], "approved")

        md_list_response = self.client.get("/api/cost-estimation/sheets/", {"workflow": "md"})
        self.assertEqual(md_list_response.status_code, 200)
        self.assertEqual(len(md_list_response.data), 0)

        base_list_response = self.client.get("/api/cost-estimation/sheets/")
        self.assertEqual(base_list_response.status_code, 200)
        self.assertEqual(base_list_response.data[0]["overallStatus"], "approved")
        self.assertEqual(base_list_response.data[0]["hodComment"], "Approved by HOD")
        self.assertEqual(base_list_response.data[0]["mdComment"], "Approved by MD")

    def test_cost_estimation_workflow_lists_only_latest_waiting_sheet_per_request(self):
        request_item = SalesServiceRequest.objects.create(
            referenceNo="RF-26-0108",
            requestDate="2026-03-28",
            requiredDeliveryDate="2026-03-28",
            clientName="Queue Client",
            companyName="Queue Company",
            phoneNo="9876543210",
            email="queue@example.com",
            itemName="Panel",
            quantity=5,
            unit="Nos",
            paymentTerms="Advance",
            taxPreference="GST Extra",
            deliveryLocation="Tiruppur",
            deliveryMode="Courier",
        )
        CostEstimationSheet.objects.create(
            salesServiceRequest=request_item,
            costEstimationNo="CST-26-0108",
            taxPercentage=18,
            profitMarginPercentage=10,
            subtotal=1000,
            taxAmount=180,
            profitMarginAmount=100,
            finalBatteryCost=1280,
            costPerUnit=256,
            sentToHead=True,
            hodStatus="pending",
            mdStatus="pending",
        )
        CostEstimationSheet.objects.create(
            salesServiceRequest=request_item,
            costEstimationNo="CST-26-0109",
            taxPercentage=18,
            profitMarginPercentage=10,
            subtotal=1200,
            taxAmount=216,
            profitMarginAmount=120,
            finalBatteryCost=1536,
            costPerUnit=307.2,
            sentToHead=True,
            hodStatus="pending",
            mdStatus="pending",
        )

        hod_list_response = self.client.get("/api/cost-estimation/sheets/", {"workflow": "hod"})
        self.assertEqual(hod_list_response.status_code, 200)
        matching_rows = [
            row for row in hod_list_response.data if row["referenceNo"] == "RF-26-0108"
        ]
        self.assertEqual(len(matching_rows), 1)
        self.assertEqual(matching_rows[0]["costEstimationNo"], "CST-26-0109")

    def test_cost_estimation_update_resets_approval_workflow(self):
        sheet = self.create_cost_estimation_sheet()
        sheet_id = sheet["id"]
        request_id = SalesServiceRequest.objects.get(referenceNo=sheet["referenceNo"]).id

        self.client.post(f"/api/cost-estimation/sheets/{sheet_id}/send-to-head/")
        self.client.post(
            f"/api/cost-estimation/sheets/{sheet_id}/review/",
            {
                "stage": "hod",
                "status": "approved",
                "comment": "Approved by HOD",
            },
            format="json",
        )
        self.client.post(
            f"/api/cost-estimation/sheets/{sheet_id}/review/",
            {
                "stage": "md",
                "status": "approved",
                "comment": "Approved by MD",
            },
            format="json",
        )

        update_response = self.client.put(
            f"/api/cost-estimation/sheets/{sheet_id}/",
            {
                "salesServiceRequestId": request_id,
                "taxPercentage": 5,
                "profitMarginPercentage": 10,
                "rows": [
                    {
                        "section": "raw_material",
                        "itemName": "Lithium",
                        "secondaryLabel": "Category",
                        "secondaryValue": "Chemical",
                        "unit": "kg",
                        "rate": 100,
                        "quantity": 3,
                        "total": 300,
                        "displayOrder": 1,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(update_response.status_code, 200)
        self.assertFalse(update_response.data["sentToHead"])
        self.assertEqual(update_response.data["hodStatus"], "pending")
        self.assertEqual(update_response.data["mdStatus"], "pending")
        self.assertEqual(update_response.data["hodComment"], "")
        self.assertEqual(update_response.data["mdComment"], "")

    def test_seed_rfq_workflow_command_creates_five_records_in_hod_queue(self):
        output_buffer = StringIO()

        call_command(
            "seed_rfq_workflow",
            count=5,
            request_date="2026-03-31",
            stdout=output_buffer,
        )

        self.assertEqual(SalesServiceRequest.objects.count(), 5)
        self.assertEqual(CostEstimationSheet.objects.count(), 5)
        self.assertEqual(
            CostEstimationSheet.objects.filter(
                sentToHead=True,
                hodStatus=CostEstimationSheet.APPROVAL_PENDING,
                mdStatus=CostEstimationSheet.APPROVAL_PENDING,
            ).count(),
            5,
        )

        catalog_response = self.client.get("/api/cost-estimation/sheets/")
        self.assertEqual(catalog_response.status_code, 200)
        self.assertEqual(len(catalog_response.data), 5)

        hod_list_response = self.client.get("/api/cost-estimation/sheets/", {"workflow": "hod"})
        self.assertEqual(hod_list_response.status_code, 200)
        self.assertEqual(len(hod_list_response.data), 5)

        md_list_response = self.client.get("/api/cost-estimation/sheets/", {"workflow": "md"})
        self.assertEqual(md_list_response.status_code, 200)
        self.assertEqual(len(md_list_response.data), 0)

        self.assertIn(
            "Created 5 RFQ workflow records and sent them to HOD approval.",
            output_buffer.getvalue(),
        )

    def test_quotation_next_number_returns_first_number_for_year(self):
        response = self.client.get("/api/quotation/next-number/", {"quotationDate": "2026-03-31"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["quotationCode"], "QUOTE-26-0001")

    def test_quotation_catalog_returns_scope_details_and_cost_total(self):
        request_item = SalesServiceRequest.objects.create(
            referenceNo="RF-26-0099",
            modeOfContact="phone",
            requestDate="2026-03-28",
            requiredDeliveryDate="2026-03-28",
            clientName="Arun Kumar",
            companyName="Acme Industries",
            phoneNo="9876543210",
            email="",
            requestType="service",
            batteryServices=["Battery Inspection", "Battery Testing"],
            scopeArea="Battery Inspection\nBattery Testing",
            paymentTerms="Advance",
            taxPreference="GST Extra",
            deliveryLocation="Tiruppur",
            deliveryMode="Courier",
        )
        CostEstimationSheet.objects.create(
            salesServiceRequest=request_item,
            costEstimationNo="CST-26-0099",
            taxPercentage=18,
            profitMarginPercentage=10,
            rawMaterialTotal=1000,
            subtotal=1000,
            taxAmount=180,
            profitMarginAmount=100,
            finalBatteryCost=1280,
            costPerUnit=640,
            sentToHead=True,
            hodStatus="approved",
            mdStatus="approved",
        )

        response = self.client.get("/api/quotation/catalog/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["requests"]), 1)
        self.assertEqual(response.data["requests"][0]["clientName"], "Arun Kumar")
        self.assertEqual(
            response.data["requests"][0]["scopeDetails"],
            ["Battery Inspection", "Battery Testing"],
        )
        self.assertEqual(response.data["requests"][0]["costEstimationNo"], "CST-26-0099")
        self.assertEqual(response.data["requests"][0]["costEstimationTotal"], 1280)
        self.assertEqual(response.data["requests"][0]["nextRevisionNo"], 0)

    def test_quotation_catalog_prefers_latest_approved_cost_estimation_without_duplicates(self):
        request_item = SalesServiceRequest.objects.create(
            referenceNo="RF-26-0102",
            modeOfContact="phone",
            requestDate="2026-03-28",
            requiredDeliveryDate="2026-03-28",
            clientName="Approved Client",
            companyName="Approved Company",
            phoneNo="9876543210",
            email="",
            requestType="service",
            batteryServices=["Battery Inspection"],
            scopeArea="Battery Inspection",
            paymentTerms="Advance",
            taxPreference="GST Extra",
            deliveryLocation="Tiruppur",
            deliveryMode="Courier",
        )
        CostEstimationSheet.objects.create(
            salesServiceRequest=request_item,
            costEstimationNo="CST-26-0102",
            taxPercentage=18,
            profitMarginPercentage=10,
            rawMaterialTotal=1000,
            subtotal=1000,
            taxAmount=180,
            profitMarginAmount=100,
            finalBatteryCost=1280,
            costPerUnit=256,
            sentToHead=True,
            hodStatus="pending",
            mdStatus="pending",
        )
        CostEstimationSheet.objects.create(
            salesServiceRequest=request_item,
            costEstimationNo="CST-26-0103",
            taxPercentage=18,
            profitMarginPercentage=10,
            rawMaterialTotal=1200,
            subtotal=1200,
            taxAmount=216,
            profitMarginAmount=120,
            finalBatteryCost=1536,
            costPerUnit=307.2,
            sentToHead=True,
            hodStatus="approved",
            mdStatus="approved",
        )

        response = self.client.get("/api/quotation/catalog/")
        self.assertEqual(response.status_code, 200)
        matching_requests = [
            item for item in response.data["requests"] if item["referenceNo"] == "RF-26-0102"
        ]
        self.assertEqual(len(matching_requests), 1)
        self.assertEqual(matching_requests[0]["costEstimationNo"], "CST-26-0103")
        self.assertEqual(matching_requests[0]["costEstimationTotal"], 1536)

    def test_quotation_catalog_falls_back_to_item_details_for_legacy_requests(self):
        request_item = SalesServiceRequest.objects.create(
            referenceNo="RF-26-0101",
            requestDate="2026-03-28",
            requiredDeliveryDate="2026-03-28",
            clientName="Legacy Client",
            companyName="Legacy Company",
            phoneNo="9876543210",
            email="legacy@example.com",
            itemName="Panasonic",
            quantity=5,
            unit="Nos",
            paymentTerms="Advance",
            taxPreference="GST Extra",
            deliveryLocation="Tiruppur",
            deliveryMode="Courier",
        )
        CostEstimationSheet.objects.create(
            salesServiceRequest=request_item,
            costEstimationNo="CST-26-0101",
            taxPercentage=18,
            profitMarginPercentage=10,
            rawMaterialTotal=1000,
            subtotal=1000,
            taxAmount=180,
            profitMarginAmount=100,
            finalBatteryCost=1280,
            costPerUnit=256,
            sentToHead=True,
            hodStatus="approved",
            mdStatus="approved",
        )

        response = self.client.get("/api/quotation/catalog/")
        self.assertEqual(response.status_code, 200)
        matching_request = next(
            item
            for item in response.data["requests"]
            if item["referenceNo"] == "RF-26-0101"
        )
        self.assertEqual(matching_request["scopeDetails"], ["Panasonic 5 Nos"])

    def test_quotation_create_generates_code_and_increments_revision(self):
        request_item = SalesServiceRequest.objects.create(
            referenceNo="RF-26-0100",
            modeOfContact="phone",
            requestDate="2026-03-28",
            requiredDeliveryDate="2026-03-28",
            clientName="Arun Kumar",
            companyName="Acme Industries",
            phoneNo="9876543210",
            email="",
            requestType="service",
            batteryServices=["Battery Inspection"],
            scopeArea="Battery Inspection",
            paymentTerms="Advance",
            taxPreference="GST Extra",
            deliveryLocation="Tiruppur",
            deliveryMode="Courier",
        )
        sheet = CostEstimationSheet.objects.create(
            salesServiceRequest=request_item,
            costEstimationNo="CST-26-0100",
            taxPercentage=18,
            profitMarginPercentage=10,
            rawMaterialTotal=1000,
            subtotal=1000,
            taxAmount=180,
            profitMarginAmount=100,
            finalBatteryCost=1280,
            costPerUnit=640,
            sentToHead=True,
            hodStatus="approved",
            mdStatus="approved",
        )

        payload = {
            "salesServiceRequestId": request_item.id,
            "costEstimationSheetId": sheet.id,
            "quotationDate": "2026-03-31",
            "expiryDate": "2026-04-12",
            "paymentTermsType": "100% Advance",
            "paymentTerms": "100% advance before dispatch.",
            "deliveryTermsType": "Ex Works",
            "deliveryTerms": "Material will be supplied from Tiruppur.",
            "termsType": "General Terms",
            "terms": "Subject to Tiruppur jurisdiction.",
            "currency": {
                "code": "USD",
                "name": "USA",
                "symbol": "$",
                "rateToInr": 91.357,
                "amountLabel": "Dollars",
            },
        }

        first_response = self.client.post("/api/quotation/", payload, format="json")
        self.assertEqual(first_response.status_code, 201)
        self.assertEqual(first_response.data["data"]["quotationCode"], "QUOTE-26-0001")
        self.assertEqual(first_response.data["data"]["revisedNo"], 0)
        self.assertEqual(first_response.data["data"]["quoteValidityDays"], 12)
        self.assertEqual(first_response.data["data"]["currencyCode"], "USD")
        self.assertEqual(first_response.data["data"]["scopeDetails"], ["Battery Inspection"])
        self.assertEqual(first_response.data["data"]["paymentTermsType"], "100% Advance")
        self.assertEqual(
            first_response.data["data"]["paymentTerms"],
            "100% advance payment to be released against quotation confirmation before execution and dispatch.",
        )

        second_response = self.client.post("/api/quotation/", payload, format="json")
        self.assertEqual(second_response.status_code, 201)
        self.assertEqual(second_response.data["data"]["quotationCode"], "QUOTE-26-0002")
        self.assertEqual(second_response.data["data"]["revisedNo"], 1)
        self.assertEqual(Quotation.objects.count(), 2)

    def test_quotation_catalog_excludes_unapproved_and_already_quoted_requests(self):
        pending_request = SalesServiceRequest.objects.create(
            referenceNo="RF-26-0110",
            requestDate="2026-03-28",
            requiredDeliveryDate="2026-03-28",
            clientName="Pending Client",
            companyName="Pending Company",
            phoneNo="9876543210",
            email="pending@example.com",
            itemName="Pending Panel",
            quantity=3,
            unit="Nos",
            paymentTerms="Advance",
            taxPreference="GST Extra",
            deliveryLocation="Tiruppur",
            deliveryMode="Courier",
        )
        CostEstimationSheet.objects.create(
            salesServiceRequest=pending_request,
            costEstimationNo="CST-26-0110",
            taxPercentage=18,
            profitMarginPercentage=10,
            subtotal=900,
            taxAmount=162,
            profitMarginAmount=90,
            finalBatteryCost=1152,
            costPerUnit=384,
            sentToHead=True,
            hodStatus="approved",
            mdStatus="pending",
        )

        quoted_request = SalesServiceRequest.objects.create(
            referenceNo="RF-26-0111",
            requestDate="2026-03-28",
            requiredDeliveryDate="2026-03-28",
            clientName="Quoted Client",
            companyName="Quoted Company",
            phoneNo="9876543210",
            email="quoted@example.com",
            itemName="Quoted Panel",
            quantity=4,
            unit="Nos",
            paymentTerms="Advance",
            taxPreference="GST Extra",
            deliveryLocation="Tiruppur",
            deliveryMode="Courier",
        )
        quoted_sheet = CostEstimationSheet.objects.create(
            salesServiceRequest=quoted_request,
            costEstimationNo="CST-26-0111",
            taxPercentage=18,
            profitMarginPercentage=10,
            subtotal=1000,
            taxAmount=180,
            profitMarginAmount=100,
            finalBatteryCost=1280,
            costPerUnit=320,
            sentToHead=True,
            hodStatus="approved",
            mdStatus="approved",
        )
        Quotation.objects.create(
            salesServiceRequest=quoted_request,
            costEstimationSheet=quoted_sheet,
            quotationCode="QUOTE-26-0099",
            quotationDate="2026-03-31",
            expiryDate="2026-04-12",
            quoteValidityDays=12,
            revisedNo=0,
            attentionName="Quoted Client",
            companyName="Quoted Company",
            referenceNo="RF-26-0111",
            costEstimationNo="CST-26-0111",
            scopeDetails=["Quoted Panel 4 Nos"],
            totalCost=1280,
            paymentTermsType="100% Advance",
            paymentTerms="100% advance payment to be released against quotation confirmation before execution and dispatch.",
            deliveryTermsType="Road Transport",
            deliveryTerms="Dispatch by road transport.",
            termsType="General Terms",
            terms="Subject to approval.",
        )

        response = self.client.get("/api/quotation/catalog/")
        self.assertEqual(response.status_code, 200)
        references = {row["referenceNo"] for row in response.data["requests"]}
        self.assertNotIn("RF-26-0110", references)
        self.assertNotIn("RF-26-0111", references)

    def test_opening_stock_snapshot_create_and_get_latest(self):
        itemfolder = ItemFolder.objects.create(**self.itemfolder_payload)
        response = self.client.post(
            "/api/opening-stock/",
            {
                "header": {"date": "24-03-2026", "code": "OPEN-001"},
                "rows": [
                    {
                        "itemId": str(itemfolder.id),
                        "itemCode": itemfolder.itemCode,
                        "itemName": itemfolder.itemName,
                        "unit": itemfolder.unit,
                        "quantity": 7,
                    }
                ],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(OpeningStock.objects.count(), 1)
        self.assertEqual(OpeningStockRow.objects.count(), 1)

        latest_response = self.client.get("/api/opening-stock/")
        self.assertEqual(latest_response.status_code, 200)
        self.assertEqual(latest_response.data["header"]["code"], "OPEN-001")
        self.assertEqual(len(latest_response.data["rows"]), 1)

    def test_opening_stock_available_returns_remaining_quantity_only(self):
        self.create_opening_stock_snapshot(quantity=10)
        self.client.post(
            "/add-item/",
            {**self.item_payload, "quantity": 4},
            format="json",
        )

        response = self.client.get("/api/opening-stock/available/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["items"]), 1)
        self.assertEqual(response.data["items"][0]["availableQuantity"], 6)
        self.assertEqual(
            response.data["items"][0]["salesPrice"],
            self.itemfolder_payload["salesPrice"],
        )
        self.assertEqual(
            response.data["items"][0]["itemDescription"],
            self.itemfolder_payload["itemDescription"],
        )

    def test_opening_stock_snapshot_get_returns_remaining_quantity_after_sales(self):
        self.create_opening_stock_snapshot(quantity=10)
        self.client.post(
            "/add-item/",
            {**self.item_payload, "quantity": 4},
            format="json",
        )

        response = self.client.get("/api/opening-stock/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["rows"]), 1)
        self.assertEqual(response.data["rows"][0]["quantity"], 6)
        self.assertFalse(response.data["rows"][0]["disabled"])

    def test_opening_stock_available_hides_item_when_quantity_becomes_zero(self):
        self.create_opening_stock_snapshot(quantity=10)
        self.client.post(
            "/add-item/",
            {**self.item_payload, "quantity": 10},
            format="json",
        )

        response = self.client.get("/api/opening-stock/available/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["items"], [])

        latest_response = self.client.get("/api/opening-stock/")
        self.assertEqual(latest_response.status_code, 200)
        self.assertEqual(len(latest_response.data["rows"]), 1)
        self.assertEqual(latest_response.data["rows"][0]["quantity"], 0)
        self.assertTrue(latest_response.data["rows"][0]["disabled"])

    def test_dispatch_summary_creates_record(self):
        response = self.client.post("/api/dispatch-summary/", self.dispatch_payload, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(DispatchSummary.objects.count(), 1)
        dispatch_summary = DispatchSummary.objects.get()
        self.assertEqual(dispatch_summary.currencyCode, "OMR")
        self.assertEqual(dispatch_summary.currencyName, "Oman")
        self.assertEqual(dispatch_summary.currencySymbol, "OMR")
        self.assertEqual(dispatch_summary.subtotal, 432.25)

    def test_dispatch_summary_rejects_invalid_payload(self):
        response = self.client.post("/api/dispatch-summary/", {}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_build_invoice_context_converts_values_for_selected_currency(self):
        context = _build_invoice_context(
            items=[self.item_payload],
            dispatch=self.dispatch_payload["dispatch"],
            summary=self.dispatch_payload["summary"],
            currency=self.dispatch_payload["currency"],
        )

        self.assertEqual(context["currency"]["code"], "OMR")
        self.assertEqual(context["currency"]["symbol"], "OMR")
        self.assertEqual(context["currency"]["precision"], 3)
        self.assertAlmostEqual(
            context["items"][0]["rate"],
            self.item_payload["rate"] / self.dispatch_payload["currency"]["rateToInr"],
            places=6,
        )
        self.assertAlmostEqual(
            context["summary"]["net"],
            self.dispatch_payload["summary"]["net"] / self.dispatch_payload["currency"]["rateToInr"],
            places=6,
        )

    def test_invoice_template_uses_omr_symbol_and_three_decimals(self):
        context = _build_invoice_context(
            items=[self.item_payload],
            dispatch=self.dispatch_payload["dispatch"],
            summary=self.dispatch_payload["summary"],
            currency=self.dispatch_payload["currency"],
        )

        html = render_to_string("invoice.html", context)

        self.assertIn("OMR", html)
        self.assertIn(
            f"OMR {context['summary']['net']:.3f}",
            html,
        )

    def test_generate_pdf_returns_pdf(self):
        payload = {**self.dispatch_payload, "items": [self.item_payload]}
        response = self.client.post("/api/generate-pdf/", payload, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertTrue(response.content.startswith(b"%PDF"))
