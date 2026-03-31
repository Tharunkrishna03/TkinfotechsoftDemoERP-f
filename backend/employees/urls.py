from django.urls import path

from employees import views

urlpatterns = [
    path("", views.employee_data_view, name="home"),
    path("payment/", views.employee_data_view, name="payment"),
    path("general/", views.general, name="general"),
    path("delivery/", views.delivery, name="delivery"),
    path("api/admin-login/", views.admin_login, name="admin_login"),
    path("api/admin-verify/", views.verify_admin, name="verify_admin"),
    path("api/itemfolder/next-code/", views.itemfolder_next_code, name="itemfolder_next_code"),
    path(
        "api/sales-service/next-reference/",
        views.sales_service_next_reference,
        name="sales_service_next_reference",
    ),
    path("api/sales-service/", views.sales_service_collection, name="sales_service_collection"),
    path(
        "api/sales-service/<int:id>/",
        views.sales_service_detail,
        name="sales_service_detail",
    ),
    path(
        "api/cost-estimation/catalog/",
        views.cost_estimation_catalog,
        name="cost_estimation_catalog",
    ),
    path(
        "api/cost-estimation/next-number/",
        views.cost_estimation_next_number,
        name="cost_estimation_next_number",
    ),
    path(
        "api/cost-estimation/sheets/",
        views.cost_estimation_sheet_collection,
        name="cost_estimation_sheet_collection",
    ),
    path(
        "api/cost-estimation/sheets/<int:id>/",
        views.cost_estimation_sheet_detail,
        name="cost_estimation_sheet_detail",
    ),
    path(
        "api/cost-estimation/sheets/<int:id>/send-to-head/",
        views.cost_estimation_sheet_send_to_head,
        name="cost_estimation_sheet_send_to_head",
    ),
    path(
        "api/cost-estimation/sheets/<int:id>/review/",
        views.cost_estimation_sheet_review,
        name="cost_estimation_sheet_review",
    ),
    path(
        "api/quotation/catalog/",
        views.quotation_catalog,
        name="quotation_catalog",
    ),
    path(
        "api/quotation/next-number/",
        views.quotation_next_number,
        name="quotation_next_number",
    ),
    path(
        "api/quotation/",
        views.quotation_collection,
        name="quotation_collection",
    ),
    path("api/itemfolder/", views.itemfolder_collection, name="itemfolder_collection"),
    path("api/itemfolder/<int:id>/", views.itemfolder_detail, name="itemfolder_detail"),
    path("api/opening-stock/", views.opening_stock_snapshot, name="opening_stock_snapshot"),
    path("api/opening-stock/available/", views.opening_stock_available, name="opening_stock_available"),
    path("add-item/", views.add_item),
    path("items/", views.get_items),
    path("delete-item/<int:id>/", views.delete_item),
    path("update-item/<int:id>/", views.update_item),
    path("api/dispatch-summary/", views.save_dispatch_summary),
    path("api/generate-pdf/", views.generate_pdf, name="generate_pdf"),
]
