from django.conf import settings
from django.core.management.base import BaseCommand

from employees.views import _ensure_default_admin, _ensure_default_workflow_users


class Command(BaseCommand):
    help = "Create the default admin and workflow role users if they are missing."

    def handle(self, *args, **options):
        _ensure_default_admin()
        _ensure_default_workflow_users()

        users = (
            ("Admin", settings.DEFAULT_ADMIN_USERNAME),
            ("Sales Executive", settings.DEFAULT_SALES_EXECUTIVE_USERNAME),
            ("Lead Sales", settings.DEFAULT_LEAD_SALES_USERNAME),
            ("HOD", settings.DEFAULT_HOD_USERNAME),
            ("MD", settings.DEFAULT_MD_USERNAME),
            ("Document Controller", settings.DEFAULT_DOCUMENT_CONTROLLER_USERNAME),
            ("Store Manager", settings.DEFAULT_OPERATION_HEAD_USERNAME),
            ("Site Engineer", settings.DEFAULT_SITE_ENGINEER_USERNAME),
        )

        self.stdout.write(self.style.SUCCESS("Workflow login users are ready:"))
        for label, username in users:
            self.stdout.write(f"- {label}: {username}")
