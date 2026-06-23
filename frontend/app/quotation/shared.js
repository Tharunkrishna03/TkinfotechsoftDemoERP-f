export const QUOTE_VALIDITY_DAYS = 12;
export const CURRENCY_STORAGE_KEY = "quotation.selectedCurrencyCode";
export const RFQ_CATEGORY_QUOTE_OF_ASSESSMENT = "quote_of_assessment";

export const PAYMENT_TERM_OPTIONS = [
  {
    value: "advance_100",
    label: "100% Advance",
    content:
      "100% advance payment to be released against quotation confirmation before execution and dispatch.",
  },
  {
    value: "advance_50",
    label: "50% Advance",
    content:
      "50% advance against confirmation of the quotation and the balance 50% before delivery.",
  },
  {
    value: "credit_30",
    label: "30 Days Credit",
    content:
      "Payment shall be made within 30 days from the quotation date or invoice date, subject to approval.",
  },
];

export const DELIVERY_TERM_OPTIONS = [
  {
    value: "road_transport",
    label: "Road Transport",
    content:
      "Goods will be dispatched via road transportation (truck/lorry) to the destination. Transit risk and unloading responsibility will be as per agreed terms unless insured separately.",
  },
  {
    value: "air_freight",
    label: "Air Freight",
    content:
      "Goods will be shipped via air freight for urgent deliveries. Air freight charges, customs handling (if applicable), and insurance will be borne by the customer unless otherwise specified.",
  },
  {
    value: "sea_shipment",
    label: "Sea Shipment",
    content:
      "Goods will be dispatched through sea shipment for bulk or export orders. Freight, port handling charges, customs clearance, and insurance will be as per agreed Incoterms (FOB/CIF/etc.).",
  },
  {
    value: "rail_transport",
    label: "Rail Transport",
    content:
      "Goods may be dispatched via rail cargo based on cost and availability. Transit responsibility will be shared as per agreed commercial terms.",
  },
];

export const TERMS_BY_TYPE = {
  "Payment Terms": [
    "1. SHIPPING AND LOGISTICS PROTOCOLS",
    "- Advance Requirement: A non-refundable advance of 50% of the total order value is mandatory to initiate raw material procurement and production scheduling.",
    "- Stage Payment: 30% of the total invoice value shall be payable upon completion of production and notification of readiness for dispatch.",
    "- Final Settlement: The remaining 20% must be cleared within 7 working days from the date of delivery.",
    "- Late Fee: Interest at 18% per annum will be charged on all outstanding balances beyond the due date, calculated daily.",
    "",
    "2. TAXATION AND GST COMPLIANCE",
    "- GST Charges: All prices are exclusive of GST. GST at 5% or 12% (as applicable to textiles) will be added to the final invoice.",
    "- Statutory Changes: Any change in tax rates by the Government of India during the contract period will be passed on to the Buyer.",
    "- GST Credit: Fashion World will upload invoices to the GST portal only upon receipt of full payment.",
    "",
    "3. DEFAULT AND LEGAL RECOURSE",
    "- Lien on Goods: Fashion World retains a purchase money security interest in all goods until the purchase price is paid in full.",
    "- Debt Recovery: In the event of non-payment exceeding 30 days, the Buyer agrees to pay all collection costs, including legal fees.",
    "- Jurisdiction: All financial disputes are subject to the exclusive jurisdiction of the courts in Tiruppur, Tamil Nadu.",
    "",
    "4. BANKING AND TRANSACTION SECURITY",
    "- Payment Mode: Payments must be made via RTGS/NEFT/IMPS. Bank details: Punjab National Bank, A/C: 4402 0087 0004 4467.",
    "- Cash Policy: Transactions in cash exceeding Rs. 2,00,000 are strictly prohibited as per Income Tax Act Section 269ST.",
    "- Verification: Please verify bank details via official phone channels before making large transfers to prevent cyber-fraud.",
  ].join("\n"),
  "Delivery Terms": [
    "1. SHIPPING AND LOGISTICS PROTOCOLS",
    '- Delivery Terms: All dispatches are "Ex-Works" (Tiruppur) unless a separate "FOR Destination" agreement is signed.',
    "- Loading Charges: Standard loading at our warehouse is included. Specialized crating or palletizing will be charged extra.",
    "- Transporter Selection: The Buyer must nominate a preferred transporter. If not nominated, Fashion World will select a carrier at the Buyer's risk.",
    "",
    "2. RISK AND TITLE TRANSFER",
    "- Risk of Loss: The risk of loss or damage passes to the Buyer the moment the goods leave our warehouse premises.",
    '- Insurance: Transit insurance is the sole responsibility of the Buyer. We recommend "All-Risk" coverage for high-value fabric shipments.',
    "- Title Transfer: Legal title to the goods remains with Fashion World until the delivery receipt is signed and payment is realized.",
    "",
    "3. INSPECTION AND SHORTAGES",
    "- Arrival Inspection: The Buyer must verify the number of bales/cartons against the Lorry Receipt (LR) upon arrival.",
    "- Shortage Claims: Any discrepancy in quantity or visible packing damage must be endorsed on the LR and reported within 24 hours.",
    "- Hidden Defects: Claims for manufacturing defects must be submitted in writing with photographic evidence within 7 days of receipt.",
    "",
    "4. DELAYS AND FORCE MAJEURE",
    "- Lead Times: Delivery dates provided are estimates. Fashion World is not liable for delays caused by logistics providers or port congestion.",
    "- Force Majeure: Neither party is liable for failure to perform due to strikes, power shortages, or government-imposed lockdowns in Tiruppur.",
    "- Storage Fees: If the Buyer fails to take delivery within 10 days of readiness notification, a storage fee of Rs. 500/day per pallet will apply.",
  ].join("\n"),
  "General Terms": [
    "1. SHIPPING AND LOGISTICS PROTOCOLS",
    '- Delivery Terms: All dispatches are "Ex-Works" (Tiruppur) unless a separate "FOR Destination" agreement is signed.',
    "- Loading Charges: Standard loading at our warehouse is included. Specialized crating or palletizing will be charged extra.",
    "- Transporter Selection: The Buyer must nominate a preferred transporter. If not nominated, Fashion World will select a carrier at the Buyer's risk.",
    "",
    "2. RISK AND TITLE TRANSFER",
    "- Risk of Loss: The risk of loss or damage passes to the Buyer the moment the goods leave our warehouse premises.",
    '- Insurance: Transit insurance is the sole responsibility of the Buyer. We recommend "All-Risk" coverage for high-value fabric shipments.',
    "- Title Transfer: Legal title to the goods remains with Fashion World until the delivery receipt is signed and payment is realized.",
    "",
    "3. INSPECTION AND SHORTAGES",
    "- Arrival Inspection: The Buyer must verify the number of bales/cartons against the Lorry Receipt (LR) upon arrival.",
    "- Shortage Claims: Any discrepancy in quantity or visible packing damage must be endorsed on the LR and reported within 24 hours.",
    "- Hidden Defects: Claims for manufacturing defects must be submitted in writing with photographic evidence within 7 days of receipt.",
    "",
    "4. DELAYS AND FORCE MAJEURE",
    "- Lead Times: Delivery dates provided are estimates. Fashion World is not liable for delays caused by logistics providers or port congestion.",
    "- Force Majeure: Neither party is liable for failure to perform due to strikes, power shortages, or government-imposed lockdowns in Tiruppur.",
    "- Storage Fees: If the Buyer fails to take delivery within 10 days of readiness notification, a storage fee of Rs. 500/day per pallet will apply.",
  ].join("\n"),
};

export const CURRENCY_OPTIONS = [
  { name: "India", code: "INR", symbol: "\u20B9", rateToInr: 1, amountLabel: "Rupees" },
  { name: "USA", code: "USD", symbol: "$", rateToInr: 91.357, amountLabel: "Dollars" },
  { name: "Eurozone", code: "EUR", symbol: "\u20AC", rateToInr: 106.223309, amountLabel: "Euros" },
  { name: "UK", code: "GBP", symbol: "\u00A3", rateToInr: 122.847125, amountLabel: "Pounds" },
  { name: "Oman", code: "OMR", symbol: "OMR", rateToInr: 213.57, amountLabel: "Rials" },
];

export const DEFAULT_CURRENCY = CURRENCY_OPTIONS[0];
export const DEFAULT_PAYMENT_TERMS = PAYMENT_TERM_OPTIONS[0];
export const DEFAULT_DELIVERY_TERMS = DELIVERY_TERM_OPTIONS[0];
export const DEFAULT_TERMS_TYPE = "General Terms";

export function getTodayValue() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().split("T")[0];
}

export function addDaysToDate(dateValue, days) {
  if (!dateValue) {
    return "";
  }

  const parsedDate = new Date(`${dateValue}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  parsedDate.setDate(parsedDate.getDate() + days);
  return parsedDate.toISOString().split("T")[0];
}

export function getValidityDays(quotationDate, expiryDate) {
  if (!quotationDate || !expiryDate) {
    return 0;
  }

  const startDate = new Date(`${quotationDate}T00:00:00`);
  const endDate = new Date(`${expiryDate}T00:00:00`);

  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return 0;
  }

  return Math.max(Math.round((endDate - startDate) / 86400000), 0);
}

export function toNumericValue(value) {
  const parsedValue = Number.parseFloat(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

export function getCurrencyByCode(code) {
  return CURRENCY_OPTIONS.find((currency) => currency.code === code) || DEFAULT_CURRENCY;
}

export function getPaymentTermOption(value) {
  return (
    PAYMENT_TERM_OPTIONS.find((option) => option.value === value || option.label === value) ||
    null
  );
}

export function getDeliveryTermOption(value) {
  return (
    DELIVERY_TERM_OPTIONS.find((option) => option.value === value || option.label === value) ||
    null
  );
}

export function formatCurrencyPrefix(currency) {
  return currency?.code === "OMR" ? "OMR " : currency?.symbol || "";
}

export function convertFromInr(value, currency) {
  const safeCurrency = currency || DEFAULT_CURRENCY;
  return toNumericValue(value) / (Number(safeCurrency.rateToInr) || 1);
}

export function formatMoneyFromInr(value, currency) {
  const safeCurrency = currency || DEFAULT_CURRENCY;
  const precision = safeCurrency.code === "OMR" ? 3 : 2;
  return `${formatCurrencyPrefix(safeCurrency)}${convertFromInr(value, safeCurrency).toFixed(precision)}`;
}

export function createQuotationFormValues(overrides = {}) {
  const quotationDate = overrides.quotationDate || getTodayValue();
  const expiryDate =
    overrides.expiryDate || addDaysToDate(quotationDate, QUOTE_VALIDITY_DAYS);

  return {
    salesServiceRequestId: overrides.salesServiceRequestId || "",
    costEstimationSheetId: overrides.costEstimationSheetId || "",
    attentionName: overrides.attentionName || "",
    companyName: overrides.companyName || "",
    referenceNo: overrides.referenceNo || "",
    quotationDate,
    expiryDate,
    quotationCode: overrides.quotationCode || "",
    revisedNo: overrides.revisedNo || "0",
    quoteValidityDays:
      overrides.quoteValidityDays ||
      String(getValidityDays(quotationDate, expiryDate)),
    costEstimationNo: overrides.costEstimationNo || "",
    paymentTermsType: overrides.paymentTermsType || DEFAULT_PAYMENT_TERMS.value,
    paymentTerms: overrides.paymentTerms || DEFAULT_PAYMENT_TERMS.content,
    deliveryTermsType: overrides.deliveryTermsType || DEFAULT_DELIVERY_TERMS.value,
    deliveryTerms: overrides.deliveryTerms || DEFAULT_DELIVERY_TERMS.content,
    termsType: overrides.termsType || DEFAULT_TERMS_TYPE,
    terms: overrides.terms || TERMS_BY_TYPE[DEFAULT_TERMS_TYPE],
  };
}

export function isQuoteOfAssessment(source) {
  return source?.rfqCategory === RFQ_CATEGORY_QUOTE_OF_ASSESSMENT;
}

export function shouldHideQuotationCode(source) {
  return isQuoteOfAssessment(source);
}

export function getQuotationCodeDisplay(source, fallback = "-") {
  if (shouldHideQuotationCode(source)) {
    return fallback;
  }

  const quotationCode = String(source?.quotationCode || "").trim();
  return quotationCode || fallback;
}

export function getQuotationDocumentTitle(source, fallback = "Quotation") {
  if (!shouldHideQuotationCode(source)) {
    return String(source?.quotationCode || "").trim() || fallback;
  }

  return String(source?.referenceNo || "").trim() || fallback;
}

export function getApiErrorMessage(source, fallbackMessage) {
  if (typeof source === "string") {
    const trimmedValue = source.trim();
    return trimmedValue || fallbackMessage;
  }

  if (Array.isArray(source)) {
    for (const item of source) {
      const message = getApiErrorMessage(item, "");

      if (message) {
        return message;
      }
    }

    return fallbackMessage;
  }

  if (source && typeof source === "object") {
    for (const value of Object.values(source)) {
      const message = getApiErrorMessage(value, "");

      if (message) {
        return message;
      }
    }
  }

  return fallbackMessage;
}
