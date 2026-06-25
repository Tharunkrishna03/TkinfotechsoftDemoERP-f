from django.urls import path

from employees import views

urlpatterns = [
    path("", views.employee_data_view, name="home"),
    path("payment/", views.employee_data_view, name="payment"),
    path("general/", views.general, name="general"),
    path("delivery/", views.delivery, name="delivery"),
    path("api/admin-login/", views.admin_login, name="admin_login"),
    path("api/admin-verify/", views.verify_admin, name="verify_admin"),
    path("api/users/", views.users_collection, name="users_collection"),
    path("api/users/<int:id>/", views.user_detail, name="user_detail"),
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
    path(
        "api/quotation/<int:id>/",
        views.quotation_detail,
        name="quotation_detail",
    ),
    path(
        "api/quotation/<int:id>/send-to-head/",
        views.quotation_send_to_head,
        name="quotation_send_to_head",
    ),
    path(
        "api/quotation/<int:id>/review/",
        views.quotation_review,
        name="quotation_review",
    ),
    path(
        "api/quotation/<int:id>/client-response/",
        views.quotation_client_response,
        name="quotation_client_response",
    ),
    path(
        "api/purchase-order/catalog/",
        views.purchase_order_catalog,
        name="purchase_order_catalog",
    ),
    path(
        "api/purchase-order/next-number/",
        views.purchase_order_next_number,
        name="purchase_order_next_number",
    ),
    path(
        "api/purchase-order/",
        views.purchase_order_collection,
        name="purchase_order_collection",
    ),
    path(
        "api/purchase-order/<int:id>/",
        views.purchase_order_detail,
        name="purchase_order_detail",
    ),
    path(
        "api/job-card/opening/<int:purchase_order_id>/",
        views.job_card_opening_detail,
        name="job_card_opening_detail",
    ),
    path(
        "api/job-card/opening/quotation/<int:quotation_id>/",
        views.job_card_opening_quotation_detail,
        name="job_card_opening_quotation_detail",
    ),
    path(
        "api/job-card/queue/",
        views.job_card_queue_collection,
        name="job_card_queue_collection",
    ),
    path(
        "api/job-card/",
        views.job_card_collection,
        name="job_card_collection",
    ),
    path(
        "api/job-card/<int:id>/",
        views.job_card_detail,
        name="job_card_detail",
    ),
    path(
        "api/job-card/<int:id>/store-manager-approve/",
        views.job_card_store_manager_approve,
        name="job_card_store_manager_approve",
    ),
    path(
        "api/job-card/<int:id>/notify-store/",
        views.job_card_notify_store_manager,
        name="job_card_notify_store_manager",
    ),
    path(
        "api/job-card/<int:id>/send-to-hod/",
        views.job_card_send_to_hod,
        name="job_card_send_to_hod",
    ),
    path(
        "api/operation-register/opening/<int:job_card_id>/",
        views.operation_register_opening_detail,
        name="operation_register_opening_detail",
    ),
    path(
        "api/operation-register/",
        views.operation_register_collection,
        name="operation_register_collection",
    ),
    path(
        "api/operation-register/<int:id>/",
        views.operation_register_detail,
        name="operation_register_detail",
    ),
    path(
        "api/operation-register/<int:id>/assign-work/",
        views.operation_register_assign_work,
        name="operation_register_assign_work",
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
