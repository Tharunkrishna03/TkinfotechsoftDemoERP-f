from django.db import models


class Item(models.Model):
    ledger = models.CharField(max_length=100)
    bill_type = models.CharField(max_length=50)
    date = models.DateField()
    code = models.CharField(max_length=50)
    item_code = models.CharField(max_length=50)
    item_name = models.CharField(max_length=100)
    unit = models.CharField(max_length=20)
    quantity = models.IntegerField()
    rate = models.FloatField()
    discount = models.FloatField()
    description = models.TextField(max_length=150)
    amount = models.FloatField()
    created_at = models.DateTimeField(auto_now_add=True, null=True)


class ItemFolder(models.Model):
    itemCode = models.CharField(max_length=50, blank=True)
    unit = models.CharField(max_length=20, blank=True)
    mrp = models.FloatField(blank=True, null=True)
    itemType = models.CharField(max_length=100, blank=True)
    hsnCode = models.CharField(max_length=50, blank=True)
    purchasePrice = models.FloatField(blank=True, null=True)
    itemName = models.CharField(max_length=100, blank=True)
    tax = models.CharField(max_length=20, blank=True)
    salesPrice = models.FloatField(blank=True, null=True)
    categoryName = models.CharField(max_length=100, blank=True)
    partNo = models.CharField(max_length=50, blank=True)
    minimumOrderQty = models.IntegerField(blank=True, null=True)
    itemGroup = models.CharField(max_length=100, blank=True)
    batchNo = models.CharField(max_length=50, blank=True)
    minimumStockQty = models.IntegerField(blank=True, null=True)
    itemDescription = models.TextField(max_length=250, blank=True)
    isStock = models.BooleanField(default=False)
    needQc = models.BooleanField(default=False)
    needWarranty = models.BooleanField(default=False)
    isActive = models.BooleanField(default=True)
    needService = models.BooleanField(default=False)
    needSerialNo = models.BooleanField(default=False)
    itemImage = models.FileField(upload_to="itemfolder/", blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.itemName or self.itemCode or f"ItemFolder {self.pk}"


class OpeningStock(models.Model):
    date = models.CharField(max_length=20, blank=True)
    code = models.CharField(max_length=50, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.code or self.date or f"OpeningStock {self.pk}"


class OpeningStockRow(models.Model):
    opening_stock = models.ForeignKey(
        OpeningStock,
        on_delete=models.CASCADE,
        related_name="rows",
    )
    item = models.ForeignKey(
        ItemFolder,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="opening_stock_rows",
    )
    itemCode = models.CharField(max_length=50, blank=True)
    itemName = models.CharField(max_length=100, blank=True)
    unit = models.CharField(max_length=20, blank=True)
    quantity = models.FloatField(default=0)

    def __str__(self):
        return self.itemName or self.itemCode or f"OpeningStockRow {self.pk}"


class DispatchSummary(models.Model):
    supplierRef = models.CharField(max_length=100)
    dispatchDocNo = models.CharField(max_length=100)
    destination = models.CharField(max_length=200)
    creditDays = models.IntegerField()
    dispatchThrough = models.CharField(max_length=100)
    remarks = models.TextField(blank=True)
    termsType = models.CharField(max_length=100)
    terms = models.TextField()
    taxable = models.FloatField()
    tax = models.FloatField()
    discount = models.FloatField(default=0)
    subtotal = models.FloatField(default=0)
    roundoff = models.FloatField(default=0)
    net = models.FloatField()
    currencyName = models.CharField(max_length=100, default="India")
    currencyCode = models.CharField(max_length=10, default="INR")
    currencySymbol = models.CharField(max_length=10, default="\u20b9")
    currencyRateToInr = models.FloatField(default=1)
    currencyAmountLabel = models.CharField(max_length=50, default="Rupees")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.supplierRef} - {self.dispatchDocNo}"


class SalesServiceRequest(models.Model):
    CONTACT_MODE_PHONE = "phone"
    CONTACT_MODE_EMAIL = "email"
    CONTACT_MODE_CHOICES = (
        (CONTACT_MODE_PHONE, "Phone"),
        (CONTACT_MODE_EMAIL, "Email"),
    )
    PLANNING_TYPE_VERBAL = "verbal"
    PLANNING_TYPE_QUOTE_AFTER = "quote_after"
    PLANNING_TYPE_QUOTE_AS_PER_REQUEST = "quote_as_per_request"
    PLANNING_TYPE_CHOICES = (
        (PLANNING_TYPE_VERBAL, "Verbal"),
        (PLANNING_TYPE_QUOTE_AFTER, "Quote after"),
        (PLANNING_TYPE_QUOTE_AS_PER_REQUEST, "Quote as per request"),
    )
    REQUEST_TYPE_MANUFACTURING = "manufacturing"
    REQUEST_TYPE_SERVICE = "service"
    REQUEST_TYPE_CHOICES = (
        (REQUEST_TYPE_MANUFACTURING, "Manufacturing"),
        (REQUEST_TYPE_SERVICE, "Service"),
    )

    referenceNo = models.CharField(max_length=20, unique=True)
    modeOfContact = models.CharField(
        max_length=20,
        choices=CONTACT_MODE_CHOICES,
        blank=True,
        default="",
    )
    emailReferenceNumber = models.CharField(max_length=100, blank=True, default="")
    requestDate = models.DateField()
    requiredDeliveryDate = models.DateField()
    clientName = models.CharField(max_length=120)
    companyName = models.CharField(max_length=160)
    phoneNo = models.CharField(max_length=20, blank=True, default="")
    email = models.EmailField(blank=True, default="")
    requestType = models.CharField(
        max_length=20,
        choices=REQUEST_TYPE_CHOICES,
        blank=True,
        default="",
    )
    batteryServices = models.JSONField(blank=True, default=list)
    scopeArea = models.TextField(blank=True, default="")
    planningType = models.CharField(
        max_length=30,
        choices=PLANNING_TYPE_CHOICES,
        blank=True,
        default="",
    )
    planStartDate = models.DateField(blank=True, null=True)
    planEndDate = models.DateField(blank=True, null=True)
    planningRemarks = models.TextField(blank=True, default="")
    manufacturingItems = models.JSONField(blank=True, default=list)
    itemName = models.CharField(max_length=160, blank=True, default="")
    quantity = models.PositiveIntegerField(default=0)
    unit = models.CharField(max_length=40, blank=True, default="")
    paymentTerms = models.CharField(max_length=80)
    taxPreference = models.CharField(max_length=80)
    deliveryLocation = models.CharField(max_length=200)
    deliveryMode = models.CharField(max_length=80)
    clientImage = models.FileField(upload_to="sales-service/", blank=True, null=True)
    isActive = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.referenceNo


class Quotation(models.Model):
    APPROVAL_PENDING = "pending"
    APPROVAL_APPROVED = "approved"
    APPROVAL_DECLINED = "declined"
    APPROVAL_STATUS_CHOICES = (
        (APPROVAL_PENDING, "Pending"),
        (APPROVAL_APPROVED, "Approved"),
        (APPROVAL_DECLINED, "Declined"),
    )
    CLIENT_STATUS_PENDING = "pending"
    CLIENT_STATUS_ACCEPTED = "accepted"
    CLIENT_STATUS_REJECTED = "rejected"
    CLIENT_STATUS_CHOICES = (
        (CLIENT_STATUS_PENDING, "Pending"),
        (CLIENT_STATUS_ACCEPTED, "Accepted"),
        (CLIENT_STATUS_REJECTED, "Rejected"),
    )

    salesServiceRequest = models.ForeignKey(
        SalesServiceRequest,
        on_delete=models.CASCADE,
        related_name="quotations",
    )
    costEstimationSheet = models.ForeignKey(
        "CostEstimationSheet",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="quotations",
    )
    quotationCode = models.CharField(max_length=20, unique=True)
    quotationDate = models.DateField()
    expiryDate = models.DateField()
    quoteValidityDays = models.PositiveIntegerField(default=12)
    # Keep the API/frontend field name while matching the migrated DB column.
    revisedNo = models.PositiveIntegerField(default=0, db_column="revisionNo")
    attentionName = models.CharField(max_length=120)
    companyName = models.CharField(max_length=160, blank=True, default="")
    referenceNo = models.CharField(max_length=20, blank=True, default="")
    costEstimationNo = models.CharField(max_length=20, blank=True, default="")
    scopeDetails = models.JSONField(blank=True, default=list)
    rfqScope = models.JSONField(blank=True, default=list)
    rfqRemarks = models.TextField(blank=True, default="")
    rfqContactMode = models.CharField(max_length=20, blank=True, default="")
    costBreakdown = models.JSONField(blank=True, default=dict)
    totalCost = models.FloatField(default=0)
    paymentTermsType = models.CharField(max_length=80, blank=True, default="")
    paymentTerms = models.TextField(blank=True, default="")
    deliveryTermsType = models.CharField(max_length=80, blank=True, default="")
    deliveryTerms = models.TextField(blank=True, default="")
    termsType = models.CharField(max_length=100, blank=True, default="")
    terms = models.TextField(blank=True, default="")
    currencyName = models.CharField(max_length=100, default="India")
    currencyCode = models.CharField(max_length=10, default="INR")
    currencySymbol = models.CharField(max_length=10, default="\u20b9")
    currencyRateToInr = models.FloatField(default=1)
    currencyAmountLabel = models.CharField(max_length=50, default="Rupees")
    sentToHead = models.BooleanField(default=False)
    hodStatus = models.CharField(
        max_length=20,
        choices=APPROVAL_STATUS_CHOICES,
        default=APPROVAL_PENDING,
    )
    hodComment = models.TextField(blank=True, default="")
    mdStatus = models.CharField(
        max_length=20,
        choices=APPROVAL_STATUS_CHOICES,
        default=APPROVAL_PENDING,
    )
    mdComment = models.TextField(blank=True, default="")
    clientStatus = models.CharField(
        max_length=20,
        choices=CLIENT_STATUS_CHOICES,
        default=CLIENT_STATUS_PENDING,
    )
    clientComment = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at", "-id")

    def __str__(self):
        return self.quotationCode or f"Quotation {self.pk}"


class CostEstimationRate(models.Model):
    SECTION_CHOICES = (
        ("raw_material", "Raw Material"),
        ("manufacturing", "Manufacturing Process"),
        ("labor", "Labor"),
        ("testing", "Testing"),
        ("packaging", "Packaging & Logistics"),
        ("overhead", "Overhead"),
    )

    section = models.CharField(max_length=40, choices=SECTION_CHOICES)
    itemName = models.CharField(max_length=120)
    secondaryLabel = models.CharField(max_length=60, blank=True, default="")
    secondaryValue = models.CharField(max_length=120, blank=True, default="")
    unit = models.CharField(max_length=20)
    rate = models.FloatField()
    displayOrder = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ("section", "displayOrder", "id")

    def __str__(self):
        return f"{self.get_section_display()} - {self.itemName}"


class CostEstimationSheet(models.Model):
    APPROVAL_PENDING = "pending"
    APPROVAL_APPROVED = "approved"
    APPROVAL_DECLINED = "declined"
    APPROVAL_STATUS_CHOICES = (
        (APPROVAL_PENDING, "Pending"),
        (APPROVAL_APPROVED, "Approved"),
        (APPROVAL_DECLINED, "Declined"),
    )

    salesServiceRequest = models.ForeignKey(
        SalesServiceRequest,
        on_delete=models.CASCADE,
        related_name="costEstimationSheets",
    )
    costEstimationNo = models.CharField(max_length=20, unique=True)
    taxPercentage = models.FloatField(default=0)
    profitMarginPercentage = models.FloatField(default=0)
    rawMaterialTotal = models.FloatField(default=0)
    processTotal = models.FloatField(default=0)
    laborTotal = models.FloatField(default=0)
    testingTotal = models.FloatField(default=0)
    packagingTotal = models.FloatField(default=0)
    overheadTotal = models.FloatField(default=0)
    miscellaneousTotal = models.FloatField(default=0)
    subtotal = models.FloatField(default=0)
    taxAmount = models.FloatField(default=0)
    profitMarginAmount = models.FloatField(default=0)
    finalBatteryCost = models.FloatField(default=0)
    costPerUnit = models.FloatField(default=0)
    sentToHead = models.BooleanField(default=False)
    hodStatus = models.CharField(
        max_length=20,
        choices=APPROVAL_STATUS_CHOICES,
        default=APPROVAL_PENDING,
    )
    hodComment = models.TextField(blank=True, default="")
    mdStatus = models.CharField(
        max_length=20,
        choices=APPROVAL_STATUS_CHOICES,
        default=APPROVAL_PENDING,
    )
    mdComment = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at", "-id")

    def __str__(self):
        return self.costEstimationNo or f"{self.salesServiceRequest.referenceNo} - Cost Estimation {self.pk}"

    def get_overall_status(self):
        if (
            self.hodStatus == self.APPROVAL_APPROVED
            and self.mdStatus == self.APPROVAL_APPROVED
        ):
            return self.APPROVAL_APPROVED

        if (
            self.hodStatus == self.APPROVAL_DECLINED
            or self.mdStatus == self.APPROVAL_DECLINED
        ):
            return self.APPROVAL_DECLINED

        return self.APPROVAL_PENDING

    def has_quotation(self):
        prefetched_objects = getattr(self, "_prefetched_objects_cache", {})
        if "quotations" in prefetched_objects:
            return bool(prefetched_objects["quotations"])
        return self.quotations.exists()

    def is_locked_for_editing(self):
        if self.has_quotation():
            return True

        overall_status = self.get_overall_status()
        return self.sentToHead and overall_status == self.APPROVAL_PENDING

    def is_workflow_locked(self):
        if self.has_quotation():
            return True

        overall_status = self.get_overall_status()
        if overall_status == self.APPROVAL_APPROVED:
            return True

        return self.sentToHead and overall_status == self.APPROVAL_PENDING


class CostEstimationSheetRow(models.Model):
    SECTION_CHOICES = CostEstimationRate.SECTION_CHOICES + (
        ("miscellaneous", "Miscellaneous"),
    )

    sheet = models.ForeignKey(
        CostEstimationSheet,
        on_delete=models.CASCADE,
        related_name="rows",
    )
    section = models.CharField(max_length=40, choices=SECTION_CHOICES)
    itemName = models.CharField(max_length=120)
    secondaryLabel = models.CharField(max_length=60, blank=True, default="")
    secondaryValue = models.CharField(max_length=120, blank=True, default="")
    unit = models.CharField(max_length=20, blank=True, default="")
    rate = models.FloatField(default=0)
    quantity = models.FloatField(default=0)
    total = models.FloatField(default=0)
    displayOrder = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ("section", "displayOrder", "id")

    def __str__(self):
        return f"{self.sheet_id} - {self.itemName}"
