from django.db import migrations


MARINE_COST_ESTIMATION_RATES = [
    ("raw_material", "Marine Zinc Anodes", "Category", "Cathodic Protection", "pcs", 1850, 1),
    ("raw_material", "Aluminum Anodes", "Category", "Cathodic Protection", "pcs", 1650, 2),
    ("raw_material", "MGPS Copper Anodes", "Category", "Electrolysis System", "pcs", 2100, 3),
    ("raw_material", "Duramax Marine Bearings & Seals", "Category", "Shaft Line", "set", 14500, 4),
    ("raw_material", "Sikaflex Sealants & Adhesives", "Category", "Bonding & Sealing", "cartridge", 135, 5),
    ("raw_material", "Metaline Surface Protection Coating", "Category", "Protective Coating", "litre", 820, 6),
    ("raw_material", "Marine Rope", "Category", "Deck Consumable", "coil", 950, 7),
    ("manufacturing", "Surface Protection Coating", "Machine Used", "Airless Spray Unit", "hr", 950, 1),
    ("manufacturing", "Machining", "Machine Used", "Portable Lathe / Milling Machine", "hr", 1750, 2),
    ("manufacturing", "NGP Cleaning & Flushing", "Machine Used", "Flushing Pump Skid", "hr", 1250, 3),
    ("manufacturing", "Pumps & Valves Overhauling", "Machine Used", "Valve Test Bench", "hr", 1450, 4),
    ("manufacturing", "Ship & Yard Repair Works", "Machine Used", "Dockside Repair Team", "hr", 1850, 5),
    ("labor", "Marine Service Engineer", "", "", "hr", 320, 1),
    ("labor", "Certified Welder / Fabricator", "", "", "hr", 260, 2),
    ("labor", "QA / QC Inspector", "", "", "hr", 280, 3),
    ("testing", "Hydro Test & Pressure Test", "", "", "test", 950, 1),
    ("testing", "Vibration Analysis", "", "", "test", 1250, 2),
    ("testing", "Alignment Verification", "", "", "test", 1100, 3),
    ("testing", "NDT Inspection", "", "", "test", 1400, 4),
    ("packaging", "Local Port Delivery", "", "", "trip", 650, 1),
    ("packaging", "Heavy Equipment Mobilization", "", "", "trip", 2400, 2),
    ("packaging", "Offshore Launch Support", "", "", "trip", 4200, 3),
    ("packaging", "Spare Parts Courier", "", "", "shipment", 350, 4),
    ("overhead", "Yard Utilities", "", "", "month", 28000, 1),
    ("overhead", "Dockside Safety Compliance", "", "", "job", 6500, 2),
    ("overhead", "Workshop Maintenance", "", "", "month", 18000, 3),
    ("overhead", "Supervisory & Admin Support", "", "", "month", 22000, 4),
]


def refresh_cost_estimation_rates(apps, schema_editor):
    CostEstimationRate = apps.get_model("employees", "CostEstimationRate")
    CostEstimationRate.objects.all().delete()
    CostEstimationRate.objects.bulk_create(
        [
            CostEstimationRate(
                section=section,
                itemName=item_name,
                secondaryLabel=secondary_label,
                secondaryValue=secondary_value,
                unit=unit,
                rate=rate,
                displayOrder=display_order,
            )
            for section, item_name, secondary_label, secondary_value, unit, rate, display_order in MARINE_COST_ESTIMATION_RATES
        ]
    )


class Migration(migrations.Migration):

    dependencies = [
        ("employees", "0022_purchaseorder_podate"),
    ]

    operations = [
        migrations.RunPython(refresh_cost_estimation_rates, migrations.RunPython.noop),
    ]
