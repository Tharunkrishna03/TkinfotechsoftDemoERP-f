from django.db import migrations


def restore_missing_purchase_order_table(apps, schema_editor):
    PurchaseOrder = apps.get_model("employees", "PurchaseOrder")
    table_name = PurchaseOrder._meta.db_table
    existing_tables = schema_editor.connection.introspection.table_names()

    if table_name in existing_tables:
        return

    schema_editor.create_model(PurchaseOrder)


class Migration(migrations.Migration):

    dependencies = [
        ("employees", "0024_alter_quotation_revisionno_and_more"),
    ]

    operations = [
        migrations.RunPython(
            restore_missing_purchase_order_table,
            migrations.RunPython.noop,
        ),
    ]
