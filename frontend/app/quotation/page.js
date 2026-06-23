"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FaMoneyBillWave, FaThList } from "react-icons/fa";
import { ToastContainer, toast } from "react-toastify";

import "react-toastify/dist/ReactToastify.css";

import { fetchWithAdminAuth } from "@/lib/admin-auth";
import { useAdminPageAccess } from "@/lib/use-admin-page-access";
import { buildQuotationPrintMarkup } from "./print-utils";

import styles from "./quotation.module.css";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

const PAYMENT_TERM_OPTIONS = [
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

const DELIVERY_TERM_OPTIONS = [

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

const TERMS_BY_TYPE = {
  "Payment Terms": `
1. SHIPPING AND LOGISTICS PROTOCOLS
• Advance Requirement: A non-refundable advance of 50% of the total order value is mandatory to initiate raw material procurement and production scheduling.
• Stage Payment: 30% of the total invoice value shall be payable upon completion of production and notification of readiness for dispatch.
• Final Settlement: The remaining 20% must be cleared within 7 working days from the date of delivery.
• Late Fee: Interest at 18% per annum will be charged on all outstanding balances beyond the due date, calculated daily.

2. TAXATION AND GST COMPLIANCE
• GST Charges: All prices are exclusive of GST. GST at 5% or 12% (as applicable to textiles) will be added to the final invoice.
• Statutory Changes: Any change in tax rates by the Government of India during the contract period will be passed on to the Buyer.
• GST Credit: Fashion World will upload invoices to the GST portal only upon receipt of full payment.

3. DEFAULT AND LEGAL RECOURSE
• Lien on Goods: Fashion World retains a purchase money security interest in all goods until the purchase price is paid in full.
• Debt Recovery: In the event of non-payment exceeding 30 days, the Buyer agrees to pay all collection costs, including legal fees.
• Jurisdiction: All financial disputes are subject to the exclusive jurisdiction of the courts in Tiruppur, Tamil Nadu.

4. BANKING AND TRANSACTION SECURITY
• Payment Mode: Payments must be made via RTGS/NEFT/IMPS. Bank details: Punjab National Bank, A/C: 4402 0087 0004 4467.
• Cash Policy: Transactions in cash exceeding ₹2,00,000 are strictly prohibited as per Income Tax Act Section 269ST.
• Verification: Please verify bank details via official phone channels before making large transfers to prevent cyber-fraud.
`,

  "Delivery Terms": `
1. SHIPPING AND LOGISTICS PROTOCOLS
• Delivery Terms: All dispatches are "Ex-Works" (Tiruppur) unless a separate "FOR Destination" agreement is signed.
• Loading Charges: Standard loading at our warehouse is included. Specialized crating or palletizing will be charged extra.
• Transporter Selection: The Buyer must nominate a preferred transporter. If not nominated, Fashion World will select a carrier at the Buyer's risk.

2. RISK AND TITLE TRANSFER
• Risk of Loss: The risk of loss or damage passes to the Buyer the moment the goods leave our warehouse premises.
• Insurance: Transit insurance is the sole responsibility of the Buyer. We recommend "All-Risk" coverage for high-value fabric shipments.
• Title Transfer: Legal title to the goods remains with Fashion World until the delivery receipt is signed and payment is realized.

3. INSPECTION AND SHORTAGES
• Arrival Inspection: The Buyer must verify the number of bales/cartons against the Lorry Receipt (LR) upon arrival.
• Shortage Claims: Any discrepancy in quantity or visible packing damage must be endorsed on the LR and reported within 24 hours.
• Hidden Defects: Claims for manufacturing defects must be submitted in writing with photographic evidence within 7 days of receipt.

4. DELAYS AND FORCE MAJEURE
• Lead Times: Delivery dates provided are estimates. Fashion World is not liable for delays caused by logistics providers or port congestion.
• Force Majeure: Neither party is liable for failure to perform due to strikes, power shortages, or government-imposed lockdowns in Tiruppur.
• Storage Fees: If the Buyer fails to take delivery within 10 days of readiness notification, a storage fee of ₹500/day per pallet will apply.
`,

  "General Terms": `
1. SHIPPING AND LOGISTICS PROTOCOLS
• Delivery Terms: All dispatches are "Ex-Works" (Tiruppur) unless a separate "FOR Destination" agreement is signed.
• Loading Charges: Standard loading at our warehouse is included. Specialized crating or palletizing will be charged extra.
• Transporter Selection: The Buyer must nominate a preferred transporter. If not nominated, Fashion World will select a carrier at the Buyer's risk.

2. RISK AND TITLE TRANSFER
• Risk of Loss: The risk of loss or damage passes to the Buyer the moment the goods leave our warehouse premises.
• Insurance: Transit insurance is the sole responsibility of the Buyer. We recommend "All-Risk" coverage for high-value fabric shipments.
• Title Transfer: Legal title to the goods remains with Fashion World until the delivery receipt is signed and payment is realized.

3. INSPECTION AND SHORTAGES
• Arrival Inspection: The Buyer must verify the number of bales/cartons against the Lorry Receipt (LR) upon arrival.
• Shortage Claims: Any discrepancy in quantity or visible packing damage must be endorsed on the LR and reported within 24 hours.
• Hidden Defects: Claims for manufacturing defects must be submitted in writing with photographic evidence within 7 days of receipt.

4. DELAYS AND FORCE MAJEURE
• Lead Times: Delivery dates provided are estimates. Fashion World is not liable for delays caused by logistics providers or port congestion.
• Force Majeure: Neither party is liable for failure to perform due to strikes, power shortages, or government-imposed lockdowns in Tiruppur.
• Storage Fees: If the Buyer fails to take delivery within 10 days of readiness notification, a storage fee of ₹500/day per pallet will apply.
  `,
};

const CURRENCY_OPTIONS = [
  { name: "India", code: "INR", symbol: "\u20B9", rateToInr: 1, amountLabel: "Rupees" },
  { name: "USA", code: "USD", symbol: "$", rateToInr: 91.357, amountLabel: "Dollars" },
  { name: "Eurozone", code: "EUR", symbol: "\u20AC", rateToInr: 106.223309, amountLabel: "Euros" },
  { name: "UK", code: "GBP", symbol: "\u00A3", rateToInr: 122.847125, amountLabel: "Pounds" },
  { name: "Oman", code: "OMR", symbol: "OMR", rateToInr: 213.57, amountLabel: "Rials" },
];

const DEFAULT_CURRENCY = CURRENCY_OPTIONS[0];
const CURRENCY_STORAGE_KEY = "quotation.selectedCurrencyCode";
const DEFAULT_PAYMENT_TERMS = PAYMENT_TERM_OPTIONS[0];
const DEFAULT_DELIVERY_TERMS = DELIVERY_TERM_OPTIONS[0];
const DEFAULT_TERMS_TYPE = "General Terms";
const FIXED_PAYMENT_TERMS_CONTENT = DEFAULT_PAYMENT_TERMS.content;

function getTodayValue() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().split("T")[0];
}

function addDaysToDate(dateValue, days) {
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

function getValidityDays(quotationDate, expiryDate) {
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

function toNumericValue(value) {
  const parsedValue = Number.parseFloat(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function getCurrencyByCode(code) {
  return CURRENCY_OPTIONS.find((currency) => currency.code === code) || DEFAULT_CURRENCY;
}

function getPaymentTermOption(value) {
  return (
    PAYMENT_TERM_OPTIONS.find((option) => option.value === value || option.label === value) ||
    null
  );
}

function getDeliveryTermOption(value) {
  return (
    DELIVERY_TERM_OPTIONS.find((option) => option.value === value || option.label === value) ||
    null
  );
}

function convertFromInr(value, currency) {
  const safeCurrency = currency || DEFAULT_CURRENCY;
  return toNumericValue(value) / (Number(safeCurrency.rateToInr) || 1);
}

function formatCurrencyPrefix(currency) {
  return currency?.code === "OMR" ? "OMR " : currency?.symbol || "";
}

function formatMoneyFromInr(value, currency) {
  const safeCurrency = currency || DEFAULT_CURRENCY;
  const precision = safeCurrency.code === "OMR" ? 3 : 2;
  return `${formatCurrencyPrefix(safeCurrency)}${convertFromInr(value, safeCurrency).toFixed(precision)}`;
}

async function requestQuotationCatalog() {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/quotation/catalog/`, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Failed to load quotation catalog.");
  }
  return Array.isArray(data.requests) ? data.requests : [];
}

async function requestNextQuotationNumber(quotationDate) {
  const query = quotationDate ? `?quotationDate=${encodeURIComponent(quotationDate)}` : "";
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/quotation/next-number/${query}`, {
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Failed to load quotation number.");
  }
  return String(data.quotationCode || "").trim();
}

async function requestQuotationDetail(id) {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/quotation/${id}/`, {
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Failed to load quotation.");
  }
  return data;
}

async function saveQuotation(payload) {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/quotation/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof data === "object" && data
        ? Object.values(data).flat().join(" ") || "Failed to save quotation."
        : "Failed to save quotation.",
    );
  }
  return data;
}

function QuotationPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currencyDropdownRef = useRef(null);
  const previewFrameRef = useRef(null);
  const editingQuotationId = searchParams.get("quotationId");
  const isTermsEditMode =
    searchParams.get("editMode") === "terms" && Boolean(editingQuotationId);
  const { isCheckingAuth, isAuthorized } = useAdminPageAccess(router);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [catalog, setCatalog] = useState([]);
  const [editingQuotation, setEditingQuotation] = useState(null);
  const [isCurrencyOpen, setIsCurrencyOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [preparedPayload, setPreparedPayload] = useState(null);
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [errors, setErrors] = useState({});
  const [selectedCurrency, setSelectedCurrency] = useState(() => {
    if (typeof window === "undefined") {
      return DEFAULT_CURRENCY;
    }
    return getCurrencyByCode(window.localStorage.getItem(CURRENCY_STORAGE_KEY));
  });
  const [formValues, setFormValues] = useState(() => {
    const quotationDate = getTodayValue();
    const expiryDate = addDaysToDate(quotationDate, 12);
    return {
      salesServiceRequestId: "",
      costEstimationSheetId: "",
      attentionName: "",
      companyName: "",
      referenceNo: "",
      quotationDate,
      expiryDate,
      quotationCode: "",
      revisedNo: "0",
      quoteValidityDays: String(getValidityDays(quotationDate, expiryDate)),
      costEstimationNo: "",
      paymentTermsType: DEFAULT_PAYMENT_TERMS.value,
      paymentTerms: FIXED_PAYMENT_TERMS_CONTENT,
      deliveryTermsType: DEFAULT_DELIVERY_TERMS.value,
      deliveryTerms: DEFAULT_DELIVERY_TERMS.content,
      termsType: DEFAULT_TERMS_TYPE,
      terms: TERMS_BY_TYPE[DEFAULT_TERMS_TYPE],
    };
  });

  const editingCatalogEntry = editingQuotation
    ? {
        id: Number(editingQuotation.salesServiceRequest || editingQuotation.salesServiceRequestId || 0),
        clientName: editingQuotation.attentionName || "",
        companyName: editingQuotation.companyName || "",
        referenceNo: editingQuotation.referenceNo || "",
        costEstimationSheetId:
          editingQuotation.costEstimationSheet || editingQuotation.costEstimationSheetId || "",
        costEstimationNo: editingQuotation.costEstimationNo || "",
        scopeDetails:
          Array.isArray(editingQuotation.rfqScope) && editingQuotation.rfqScope.length
            ? editingQuotation.rfqScope
            : Array.isArray(editingQuotation.scopeDetails)
              ? editingQuotation.scopeDetails
              : [],
        costEstimationTotal: toNumericValue(editingQuotation.totalCost),
        nextRevisionNo:
          Number(editingQuotation.revisionNo ?? editingQuotation.revisedNo ?? 0) + 1,
      }
    : null;
  const catalogEntries =
    editingCatalogEntry &&
    !catalog.some((requestItem) => String(requestItem.id) === String(editingCatalogEntry.id))
      ? [...catalog, editingCatalogEntry]
      : catalog;
  const selectedRequest =
    catalogEntries.find((requestItem) => String(requestItem.id) === selectedRequestId) || null;
  const scopeDetails = Array.isArray(selectedRequest?.scopeDetails)
    ? selectedRequest.scopeDetails
    : [];
  const totalCostInInr = toNumericValue(selectedRequest?.costEstimationTotal);
  const previewMarkup = previewData
    ? buildQuotationPrintMarkup({
        quotation: previewData.quotation,
        selectedCurrency: previewData.selectedCurrency,
      })
    : "";

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(CURRENCY_STORAGE_KEY, selectedCurrency.code);
  }, [selectedCurrency]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        currencyDropdownRef.current &&
        !currencyDropdownRef.current.contains(event.target)
      ) {
        setIsCurrencyOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    let isMounted = true;
    setIsLoadingCatalog(true);

    (async () => {
      try {
        const [requestRows, quotationDetail] = await Promise.all([
          requestQuotationCatalog(),
          isTermsEditMode && editingQuotationId
            ? requestQuotationDetail(editingQuotationId)
            : Promise.resolve(null),
        ]);

        if (!isMounted) {
          return;
        }

        setCatalog(requestRows);
        setEditingQuotation(quotationDetail);
      } catch (error) {
        if (isMounted) {
          toast.error(error.message || "Failed to load quotation catalog.");
        }
      } finally {
        if (isMounted) {
          setIsLoadingCatalog(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [editingQuotationId, isAuthorized, isTermsEditMode]);

  useEffect(() => {
    if (!isAuthorized || !formValues.quotationDate) {
      return;
    }

    let isMounted = true;
    const expiryDate = addDaysToDate(formValues.quotationDate, 12);

    requestNextQuotationNumber(formValues.quotationDate)
      .then((quotationCode) => {
        if (!isMounted) {
          return;
        }

        setFormValues((currentValues) => ({
          ...currentValues,
          quotationCode,
          expiryDate,
          quoteValidityDays: String(
            getValidityDays(currentValues.quotationDate, expiryDate),
          ),
        }));
      })
      .catch((error) => {
        if (isMounted) {
          toast.error(error.message || "Failed to load quotation number.");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [formValues.quotationDate, isAuthorized]);

  useEffect(() => {
    if (!editingQuotation) {
      return;
    }

    const paymentOption = getPaymentTermOption(editingQuotation.paymentTermsType);
    const deliveryOption = getDeliveryTermOption(editingQuotation.deliveryTermsType);

    setSelectedRequestId(
      String(editingQuotation.salesServiceRequest || editingQuotation.salesServiceRequestId || ""),
    );
    setSelectedCurrency(getCurrencyByCode(editingQuotation.currencyCode));
    setFormValues((currentValues) => ({
      ...currentValues,
      quotationDate: editingQuotation.quotationDate || currentValues.quotationDate,
      expiryDate: editingQuotation.expiryDate || currentValues.expiryDate,
      paymentTermsType: paymentOption?.value || currentValues.paymentTermsType,
      paymentTerms: editingQuotation.paymentTerms || currentValues.paymentTerms,
      deliveryTermsType: deliveryOption?.value || currentValues.deliveryTermsType,
      deliveryTerms: editingQuotation.deliveryTerms || currentValues.deliveryTerms,
      termsType: editingQuotation.termsType || currentValues.termsType,
      terms: editingQuotation.terms || currentValues.terms,
    }));
  }, [editingQuotation]);

  useEffect(() => {
    if (!selectedRequest) {
      setFormValues((currentValues) => ({
        ...currentValues,
        salesServiceRequestId: "",
        costEstimationSheetId: "",
        attentionName: "",
        companyName: "",
        referenceNo: "",
        costEstimationNo: "",
        revisedNo: "0",
      }));
      return;
    }

    setFormValues((currentValues) => ({
      ...currentValues,
      salesServiceRequestId: String(selectedRequest.id),
      costEstimationSheetId: String(selectedRequest.costEstimationSheetId || ""),
      attentionName: selectedRequest.clientName || "",
      companyName: selectedRequest.companyName || "",
      referenceNo: selectedRequest.referenceNo || "",
      costEstimationNo: selectedRequest.costEstimationNo || "",
      revisedNo: String(selectedRequest.nextRevisionNo ?? 0),
    }));
  }, [selectedRequest]);

  const handleFieldChange = (event) => {
    const { name, value } = event.target;

    setPreviewData(null);
    setPreparedPayload(null);
    setFormValues((currentValues) => {
      if (name === "quotationDate") {
        const expiryDate = addDaysToDate(value, 12);
        return {
          ...currentValues,
          quotationDate: value,
          expiryDate,
          quoteValidityDays: String(getValidityDays(value, expiryDate)),
        };
      }

      if (name === "paymentTermsType") {
        const option = getPaymentTermOption(value) || DEFAULT_PAYMENT_TERMS;
        return {
          ...currentValues,
          paymentTermsType: option.value,
          paymentTerms: option.content,
        };
      }

      if (name === "paymentTerms") {
        return {
          ...currentValues,
          paymentTerms: value,
        };
      }

      if (name === "deliveryTermsType") {
        const option =
          DELIVERY_TERM_OPTIONS.find((item) => item.value === value) ||
          DEFAULT_DELIVERY_TERMS;
        return {
          ...currentValues,
          deliveryTermsType: value,
          deliveryTerms: option.content,
        };
      }

      if (name === "termsType") {
        return {
          ...currentValues,
          termsType: value,
          terms: TERMS_BY_TYPE[value] || "",
        };
      }

      return {
        ...currentValues,
        [name]: value,
      };
    });

    setErrors((currentErrors) => {
      if (!currentErrors[name]) {
        return currentErrors;
      }
      const nextErrors = { ...currentErrors };
      delete nextErrors[name];
      return nextErrors;
    });
  };

  const handleAttentionChange = (event) => {
    setPreviewData(null);
    setPreparedPayload(null);
    setSelectedRequestId(event.target.value);
    setErrors((currentErrors) => {
      if (!currentErrors.salesServiceRequestId) {
        return currentErrors;
      }
      const nextErrors = { ...currentErrors };
      delete nextErrors.salesServiceRequestId;
      return nextErrors;
    });
  };

  const handleCurrencySelect = (currency) => {
    setPreviewData(null);
    setPreparedPayload(null);
    setSelectedCurrency(currency);
    setIsCurrencyOpen(false);
  };

  const resetForm = async () => {
    const quotationDate = getTodayValue();
    const expiryDate = addDaysToDate(quotationDate, 12);
    const quotationCode = await requestNextQuotationNumber(quotationDate).catch(() => "");

    setSelectedRequestId("");
    setErrors({});
    setPreviewData(null);
    setPreparedPayload(null);
    setFormValues({
      salesServiceRequestId: "",
      costEstimationSheetId: "",
      attentionName: "",
      companyName: "",
      referenceNo: "",
      quotationDate,
      expiryDate,
      quotationCode,
      revisedNo: "0",
      quoteValidityDays: String(getValidityDays(quotationDate, expiryDate)),
      costEstimationNo: "",
      paymentTermsType: DEFAULT_PAYMENT_TERMS.value,
      paymentTerms: FIXED_PAYMENT_TERMS_CONTENT,
      deliveryTermsType: DEFAULT_DELIVERY_TERMS.value,
      deliveryTerms: DEFAULT_DELIVERY_TERMS.content,
      termsType: DEFAULT_TERMS_TYPE,
      terms: TERMS_BY_TYPE[DEFAULT_TERMS_TYPE],
    });
  };

  const validateForm = () => {
    const nextErrors = {};

    if (!selectedRequestId) {
      nextErrors.salesServiceRequestId = "Select an attention name.";
    }
    if (!formValues.quotationDate) {
      nextErrors.quotationDate = "Quotation date is required.";
    }
    if (!formValues.expiryDate) {
      nextErrors.expiryDate = "Expiry date is required.";
    }
    if (!formValues.quotationCode) {
      nextErrors.quotationCode = "Quotation code is required.";
    }
    if (!formValues.paymentTermsType) {
      nextErrors.paymentTermsType = "Select a payment terms type.";
    }
    if (!formValues.paymentTerms.trim()) {
      nextErrors.paymentTerms = "Payment terms are required.";
    }
    if (!formValues.deliveryTermsType) {
      nextErrors.deliveryTermsType = "Select a delivery terms type.";
    }
    if (!formValues.deliveryTerms.trim()) {
      nextErrors.deliveryTerms = "Delivery terms are required.";
    }
    if (!formValues.termsType) {
      nextErrors.termsType = "Select a terms type.";
    }
    if (!formValues.terms.trim()) {
      nextErrors.terms = "Terms are required.";
    }
    if (!scopeDetails.length) {
      nextErrors.scopeDetails = "No stored scope details found for the selected attention.";
    }
    if (totalCostInInr <= 0) {
      nextErrors.totalCost = "No stored cost estimation total is available for the selected attention.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const buildSubmissionPayload = () => ({
    salesServiceRequestId: Number(selectedRequestId),
    costEstimationSheetId: selectedRequest?.costEstimationSheetId || null,
    quotationDate: formValues.quotationDate,
    expiryDate: formValues.expiryDate,
    quoteValidityDays: Number(formValues.quoteValidityDays) || 0,
    scopeDetails,
    totalCost: totalCostInInr,
    paymentTermsType:
      getPaymentTermOption(formValues.paymentTermsType)?.label || formValues.paymentTermsType,
    paymentTerms: formValues.paymentTerms,
    deliveryTermsType:
      DELIVERY_TERM_OPTIONS.find((option) => option.value === formValues.deliveryTermsType)?.label ||
      formValues.deliveryTermsType,
    deliveryTerms: formValues.deliveryTerms,
    termsType: formValues.termsType,
    terms: formValues.terms,
    currency: selectedCurrency,
  });

  const syncPreviewState = (quotation) => {
    setFormValues((currentValues) => ({
      ...currentValues,
      quotationCode: quotation?.quotationCode || currentValues.quotationCode,
      revisedNo: String(
        quotation?.revisedNo ??
          quotation?.revisionNo ??
          Number(currentValues.revisedNo || 0),
      ),
      quoteValidityDays: String(
        quotation?.quoteValidityDays ?? Number(currentValues.quoteValidityDays || 0),
      ),
      costEstimationNo: quotation?.costEstimationNo || currentValues.costEstimationNo,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!validateForm()) {
      toast.error("Please fix the quotation details.");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = buildSubmissionPayload();
      const response = await saveQuotation(payload);
      const savedQuotation = response.data || {};

      syncPreviewState(savedQuotation);
      setPreviewData(null);
      setPreparedPayload(null);
      toast.success(
        savedQuotation.quotationCode
          ? `${savedQuotation.quotationCode} saved successfully`
          : "Quotation saved successfully",
      );

      if (isTermsEditMode) {
        await resetForm();
        setEditingQuotation(null);
      }

      router.push("/quotation-list");
    } catch (error) {
      toast.error(error.message || "Failed to save quotation.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrint = async () => {
    if (!preparedPayload) {
      toast.error("Submit the quotation first to generate the preview.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await saveQuotation(preparedPayload);
      const savedQuotation = response.data || {};

      toast.success(
        savedQuotation.quotationCode
          ? `${savedQuotation.quotationCode} saved successfully`
          : "Quotation saved successfully",
      );
      setPreviewData(null);
      setPreparedPayload(null);

      if (isTermsEditMode) {
        await resetForm();
        setEditingQuotation(null);
        router.push("/quotation-list");
        return;
      }

      router.push(`/quotation/print?id=${savedQuotation.id}&autoprint=1`);
    } catch (error) {
      toast.error(error.message || "Failed to save quotation.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isCheckingAuth || !isAuthorized) {
    return null;
  }

  return (
    <>
      <main className={styles.contentArea}>
        <section className={styles.card}>
          <div className={styles.topRightWrapper}>
            <div>
              <h1 className={styles.pageTitle}>Quotation</h1>
             
            </div>

            <div className={styles.headerActions}>
              <button
                type="button"
                className={styles.topIconButton}
                onClick={() => router.push("/quotation-list")}
                title="Open quotation list"
                aria-label="Open quotation list"
              >
                <FaThList />
              </button>

              <div ref={currencyDropdownRef} className={styles.currencyDropdown}>
                <button
                  type="button"
                  className={styles.topCash}
                  onClick={() => setIsCurrencyOpen((currentValue) => !currentValue)}
                  title="Select currency"
                >
                  <FaMoneyBillWave />
                  <span>{selectedCurrency.code}</span>
                </button>

                {isCurrencyOpen ? (
                  <div className={styles.currencyMenu}>
                    {CURRENCY_OPTIONS.map((currency) => (
                      <button
                        key={currency.code}
                        type="button"
                        className={styles.currencyOption}
                        onClick={() => handleCurrencySelect(currency)}
                      >
                        <span>{currency.code}</span>
                        <small>{currency.name}</small>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className={styles.invoiceIntroCard}>
              <div className={styles.sectionTitleRow}>
                <h2 className={styles.sectionTitle}>Quotation Details</h2>
              </div>
              <div className={styles.invoiceIntroGrid}>
                <div className={styles.field}>
                  <label htmlFor="salesServiceRequestId">Attention name</label>
                  <select
                    id="salesServiceRequestId"
                    className={`${styles.fieldInput} ${errors.salesServiceRequestId ? styles.fieldInputError : ""}`}
                    value={selectedRequestId}
                    onChange={handleAttentionChange}
                    disabled={isLoadingCatalog}
                  >
                    <option value="">Choose attention name</option>
                    {catalogEntries.map((requestItem) => (
                      <option key={requestItem.id} value={requestItem.id}>
                        {requestItem.clientName} - {requestItem.companyName} - {requestItem.referenceNo}
                      </option>
                    ))}
                  </select>
                  {errors.salesServiceRequestId ? (
                    <p className={styles.fieldError}>{errors.salesServiceRequestId}</p>
                  ) : null}
                </div>

                <div className={styles.field}>
                  <label htmlFor="companyName">Company name</label>
                  <input
                    id="companyName"
                    className={`${styles.fieldInput} ${styles.readOnlyInput}`}
                    value={formValues.companyName}
                    readOnly
                    aria-readonly="true"
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="referenceNo">RFQ ref no</label>
                  <input
                    id="referenceNo"
                    className={`${styles.fieldInput} ${styles.readOnlyInput}`}
                    value={formValues.referenceNo}
                    readOnly
                    aria-readonly="true"
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="costEstimationNo">Cost estimation no</label>
                  <input
                    id="costEstimationNo"
                    className={`${styles.fieldInput} ${styles.readOnlyInput}`}
                    value={formValues.costEstimationNo}
                    readOnly
                    aria-readonly="true"
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="quotationDate">Quotation date</label>
                  <input
                    id="quotationDate"
                    name="quotationDate"
                    type="date"
                    className={`${styles.fieldInput} ${errors.quotationDate ? styles.fieldInputError : ""}`}
                    value={formValues.quotationDate}
                    onChange={handleFieldChange}
                  />
                  {errors.quotationDate ? (
                    <p className={styles.fieldError}>{errors.quotationDate}</p>
                  ) : null}
                </div>

                <div className={styles.field}>
                  <label htmlFor="expiryDate">Expiry date</label>
                  <input
                    id="expiryDate"
                    className={`${styles.fieldInput} ${styles.readOnlyInput} ${errors.expiryDate ? styles.fieldInputError : ""}`}
                    value={formValues.expiryDate}
                    readOnly
                    aria-readonly="true"
                  />
                  {errors.expiryDate ? (
                    <p className={styles.fieldError}>{errors.expiryDate}</p>
                  ) : null}
                </div>

                <div className={styles.field}>
                  <label htmlFor="quotationCode">Quotation code</label>
                  <input
                    id="quotationCode"
                    className={`${styles.fieldInput} ${styles.autoGeneratedInput} ${errors.quotationCode ? styles.fieldInputError : ""}`}
                    value={formValues.quotationCode}
                    readOnly
                    aria-readonly="true"
                  />
                  {errors.quotationCode ? (
                    <p className={styles.fieldError}>{errors.quotationCode}</p>
                  ) : null}
                </div>

                <div className={styles.field}>
                  <label htmlFor="revisedNo">Revised no</label>
                  <input
                    id="revisedNo"
                    className={`${styles.fieldInput} ${styles.readOnlyInput}`}
                    value={formValues.revisedNo}
                    readOnly
                    aria-readonly="true"
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="quoteValidityDays">Quote validity</label>
                  <input
                    id="quoteValidityDays"
                    className={`${styles.fieldInput} ${styles.readOnlyInput}`}
                    value={`${formValues.quoteValidityDays} Days`}
                    readOnly
                    aria-readonly="true"
                  />
                </div>
              </div>
            </div>

            <div className={styles.itemSectionCard}>
              <div className={styles.sectionHeader}>
                <h2 className={styles.sectionTitle}>Scope Details</h2>
              
              </div>

              <div className={styles.tableResponsive}>
                <table className={styles.itemsTable}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Scope </th>
                      <th>Lump sum amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scopeDetails.length ? (
                      scopeDetails.map((scopeDetail, index) => (
                        <tr key={`${scopeDetail}-${index}`}>
                          <td>{index + 1}</td>
                          <td>{scopeDetail}</td>
                          <td>-</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="3" className={styles.emptyState}>
                          {isLoadingCatalog
                            ? "Loading stored scope details..."
                            : "Select an attention name to load the stored scope details."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan="2" className={styles.totalLabelCell}>
                        Total amount 
                      </td>
                      <td className={styles.totalValueCell}>
                        {selectedRequest ? formatMoneyFromInr(totalCostInInr, selectedCurrency) : "-"}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {errors.scopeDetails ? <p className={styles.fieldError}>{errors.scopeDetails}</p> : null}
              {errors.totalCost ? <p className={styles.fieldError}>{errors.totalCost}</p> : null}
            </div>

            <div className={styles.detailCardsGrid}>
              <div className={styles.detailCard}>
                <h2 className={styles.detailCardTitle}>Payment Terms</h2>
                <div className={styles.field}>
                  <label htmlFor="paymentTermsType">Payment terms type</label>
                  <select
                    id="paymentTermsType"
                    name="paymentTermsType"
                    className={`${styles.fieldInput} ${errors.paymentTermsType ? styles.fieldInputError : ""}`}
                    value={formValues.paymentTermsType}
                    onChange={handleFieldChange}
                  >
                    {PAYMENT_TERM_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {errors.paymentTermsType ? <p className={styles.fieldError}>{errors.paymentTermsType}</p> : null}
                </div>

                <div className={styles.field}>
                  <label htmlFor="paymentTerms">Payment terms</label>
                  <textarea
                    id="paymentTerms"
                    name="paymentTerms"
                    rows="5"
                    className={`${styles.fieldInput} ${errors.paymentTerms ? styles.fieldInputError : ""}`}
                    value={formValues.paymentTerms}
                    onChange={handleFieldChange}
                  />
                  {errors.paymentTerms ? <p className={styles.fieldError}>{errors.paymentTerms}</p> : null}
                </div>
              </div>

              <div className={styles.detailCard}>
                <h2 className={styles.detailCardTitle}>Delivery Terms</h2>
                <div className={styles.field}>
                  <label htmlFor="deliveryTermsType">Delivery terms type</label>
                  <select
                    id="deliveryTermsType"
                    name="deliveryTermsType"
                    className={`${styles.fieldInput} ${errors.deliveryTermsType ? styles.fieldInputError : ""}`}
                    value={formValues.deliveryTermsType}
                    onChange={handleFieldChange}
                  >
                    {DELIVERY_TERM_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {errors.deliveryTermsType ? <p className={styles.fieldError}>{errors.deliveryTermsType}</p> : null}
                </div>

                <div className={styles.field}>
                  <label htmlFor="deliveryTerms">Delivery terms</label>
                  <textarea
                    id="deliveryTerms"
                    name="deliveryTerms"
                    rows="5"
                    className={`${styles.fieldInput} ${errors.deliveryTerms ? styles.fieldInputError : ""}`}
                    value={formValues.deliveryTerms}
                    onChange={handleFieldChange}
                  />
                  {errors.deliveryTerms ? <p className={styles.fieldError}>{errors.deliveryTerms}</p> : null}
                </div>
              </div>

              <div className={styles.detailCard}>
                <h2 className={styles.detailCardTitle}>Terms and Conditions</h2>
                <div className={styles.field}>
                  <label htmlFor="termsType">Terms type</label>
                  <select
                    id="termsType"
                    name="termsType"
                    className={`${styles.fieldInput} ${errors.termsType ? styles.fieldInputError : ""}`}
                    value={formValues.termsType}
                    onChange={handleFieldChange}
                  >
                    <option value="">Choose terms type</option>
                    {Object.keys(TERMS_BY_TYPE).map((termsType) => (
                      <option key={termsType} value={termsType}>
                        {termsType}
                      </option>
                    ))}
                  </select>
                  {errors.termsType ? <p className={styles.fieldError}>{errors.termsType}</p> : null}
                </div>

                <div className={styles.field}>
                  <label htmlFor="terms">Terms</label>
                  <textarea
                    id="terms"
                    name="terms"
                    rows="5"
                    className={`${styles.fieldInput} ${errors.terms ? styles.fieldInputError : ""}`}
                    value={formValues.terms}
                    onChange={handleFieldChange}
                  />
                  {errors.terms ? <p className={styles.fieldError}>{errors.terms}</p> : null}
                </div>
              </div>
            </div>

            <div className={styles.detailCardsGrid}>
              <div className={styles.detailCard}>
                <h2 className={styles.detailCardTitle}>Quotation Summary</h2>
                <ul className={styles.summaryList}>
                  <li className={styles.summaryItem}>
                    <span>Cost estimation total</span>
                    <span>{formatMoneyFromInr(totalCostInInr, selectedCurrency)}</span>
                  </li>
                  <li className={styles.summaryItem}>
                    <span>Currency</span>
                    <span>{selectedCurrency.code}</span>
                  </li>
                  <li className={styles.summaryItem}>
                    <span>Conversion rate to INR</span>
                    <span>{selectedCurrency.rateToInr}</span>
                  </li>
                  <li className={`${styles.summaryItem} ${styles.summaryItemEmphasis}`}>
                    <span>{selectedCurrency.amountLabel}</span>
                    <span>{formatMoneyFromInr(totalCostInInr, selectedCurrency)}</span>
                  </li>
                </ul>
              </div>

              <div className={styles.detailCard}>
                <h2 className={styles.detailCardTitle}>Stored Source</h2>
                <ul className={styles.summaryList}>
                  <li className={styles.summaryItem}>
                    <span>Attention</span>
                    <span>{formValues.attentionName || "-"}</span>
                  </li>
                  <li className={styles.summaryItem}>
                    <span>Company</span>
                    <span>{formValues.companyName || "-"}</span>
                  </li>
                  <li className={styles.summaryItem}>
                    <span>RFQ Ref</span>
                    <span>{formValues.referenceNo || "-"}</span>
                  </li>
                  <li className={`${styles.summaryItem} ${styles.summaryItemEmphasis}`}>
                    <span>Cost estimation</span>
                    <span>{formValues.costEstimationNo || "-"}</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className={styles.actionRow}>
              <button
                type="submit"
                className={styles.submitBtn}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Saving..." : "Submit"}
              </button>

              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => resetForm()}
                disabled={isSubmitting}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      </main>

      {previewData ? (
        <div
          className={styles.previewBackdrop}
          onClick={() => setPreviewData(null)}
          role="presentation"
        >
          <div
            className={styles.previewCard}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Quotation print preview"
          >
            <div className={styles.previewHeader}>
              <div>
                <h2 className={styles.previewTitle}>Quotation Preview</h2>
                <p className={styles.previewSubtitle}>
                  {previewData.quotation.quotationCode || "Preview quotation"}
                </p>
              </div>
            </div>

            <div className={styles.previewFrameShell}>
              <iframe
                ref={previewFrameRef}
                title="Quotation preview"
                className={styles.previewFrame}
                srcDoc={previewMarkup}
              />
            </div>

            <div className={styles.previewActions}>
              <button
                type="button"
                className={styles.submitBtn}
                onClick={handlePrint}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Printing..." : "Print"}
              </button>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setPreviewData(null)}
                disabled={isSubmitting}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ToastContainer position="top-right" autoClose={3000} />
    </>
  );
}

export default function QuotationPage() {
  return (
    <Suspense fallback={null}>
      <QuotationPageContent />
    </Suspense>
  );
}
