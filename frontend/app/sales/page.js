"use client";

import { useRouter } from "next/navigation";
import styles from "./sales.module.css";
import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import "bootstrap/dist/css/bootstrap.min.css";
import { FaEdit, FaTrash, FaList, FaMoneyBillWave } from "react-icons/fa";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import {
  clearStoredAdminAuth,
  getStoredAdminAuth,
  getStoredAdminToken,
  verifyAdminAccess,
} from "@/lib/admin-auth";
import { showDeleteToast } from "@/lib/toast-utils";

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
  {
    name: "India",
    code: "INR",
    symbol: "\u20B9",
    rateToInr: 1,
    amountLabel: "Rupees",
  },
  {
    name: "USA",
    code: "USD",
    symbol: "$",
    rateToInr: 91.357,
    amountLabel: "Dollars",
  },
  {
    name: "Eurozone",
    code: "EUR",
    symbol: "\u20AC",
    rateToInr: 106.223309,
    amountLabel: "Euros",
  },
  {
    name: "UK",
    code: "GBP",
    symbol: "\u00A3",
    rateToInr: 122.847125,
    amountLabel: "Pounds",
  },
  {
    name: "Oman",
    code: "OMR",
    symbol: "﷼",
    rateToInr: 213.57,
    amountLabel: "Rials",
  },
];

const getCurrencyPrecision = (currency) => (currency?.code === "OMR" ? 3 : 2);

const formatCurrencyValue = (value, currency) =>
  convertFromInr(value, currency).toFixed(getCurrencyPrecision(currency));

const formatCurrencyInputValue = (value, currency) =>
  toNumericValue(value).toFixed(getCurrencyPrecision(currency));

const formatCurrencyPrefix = (currency) =>
  currency?.code === "OMR" ? "OMR " : currency?.symbol || "";

const NORMALIZED_CURRENCY_OPTIONS = CURRENCY_OPTIONS.map((currency) =>
  currency.code === "OMR" ? { ...currency, symbol: "OMR" } : currency,
);

const DEFAULT_CURRENCY = NORMALIZED_CURRENCY_OPTIONS[0];
const CURRENCY_STORAGE_KEY = "sales.selectedCurrencyCode";
const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

const getAxiosAuthConfig = (config = {}) => {
  const token = getStoredAdminToken();
  return {
    ...config,
    headers: {
      ...(config.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
};

const getCurrencyByCode = (code) =>
  NORMALIZED_CURRENCY_OPTIONS.find((currency) => currency.code === code) ||
  DEFAULT_CURRENCY;

const toNumericValue = (value) => {
  const parsedValue = Number.parseFloat(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
};

const convertFromInr = (value, currency) =>
  toNumericValue(value) / currency.rateToInr;

const convertToInr = (value, currency) =>
  toNumericValue(value) * currency.rateToInr;

const convertCurrencyValue = (value, fromCurrency, toCurrency) =>
  convertFromInr(convertToInr(value, fromCurrency), toCurrency);

const getComputedAmount = (
  rateValue,
  quantityValue,
  discountValue,
  currency,
) => {
  const rate = parseFloat(rateValue) || 0;
  const qty = parseFloat(quantityValue) || 0;
  const discount = parseFloat(discountValue) || 0;
  const total = rate * qty;
  const discountAmount = (total * discount) / 100;
  return formatCurrencyInputValue(total - discountAmount, currency);
};

const isListableSalesItem = (item) =>
  (Number(item?.quantity) || 0) > 0 && (Number(item?.amount) || 0) > 0;

const getDueDateValue = (invoiceDate, creditDays) => {
  if (!invoiceDate) {
    return "";
  }

  const parsedDate = new Date(invoiceDate);
  if (Number.isNaN(parsedDate.getTime())) {
    return "";
  }

  const dueDate = new Date(parsedDate);
  dueDate.setDate(dueDate.getDate() + (Number(creditDays) || 0));
  return dueDate.toISOString().split("T")[0];
};

export default function Dashboard() {
  const router = useRouter();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  const [editId, setEditId] = useState(null);
  const downloadPDF = async () => {
    const element = document.getElementById("preview-area");

    if (!element) return;

    const canvas = await html2canvas(element, { scale: 2, useCORS: true });
    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF("p", "mm", "a4");
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    const margin = 5;
    const imgWidth = pdfWidth - margin * 2;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
    heightLeft -= pdfHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", margin, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;
    }

    pdf.save("invoice.pdf");
  };

  const handleCancel = () => {
    setForm({
      ledger: "",
      bill_type: "",
      date: "",
      code: "",
      item_code: "",
      item_name: "",
      unit: "",
      quantity: "",
      rate: "",
      discount: "",
      description: "",
      amount: "",
    });
    setErrors({});
    setEditId(null);
    setPreviewData(null);
    getAvailableOpeningStock(null);
  };

  const [errors, setErrors] = useState({});
  const [form, setForm] = useState({
    ledger: "",
    bill_type: "",
    date: "",
    code: "",
    item_code: "",
    item_name: "",
    unit: "",
    quantity: "",
    rate: "",
    discount: "",
    description: "",
    amount: "",
  });
  const [showPhonePopup, setShowPhonePopup] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const validateForm = () => {
    let newErrors = {};
    const selectedOpeningStockItem = availableOpeningStock.find(
      (item) => item.itemCode === form.item_code,
    );
    const quantityValue = Number(form.quantity);

    if (!form.ledger) newErrors.ledger = "Ledger is required";
    if (!form.bill_type) newErrors.bill_type = "Bill type is required";
    if (!form.date) newErrors.date = "Date is required";
    if (!form.code?.trim()) newErrors.code = "Code is required";
    if (!form.item_code) newErrors.item_code = "Item code is required";
    if (!form.item_name) newErrors.item_name = "Item name is required";
    if (form.item_code && !selectedOpeningStockItem) {
      newErrors.item_name = "Choose an item from available opening stock";
    }
    if (!form.unit) newErrors.unit = "Unit is required";

    if (!form.quantity) {
      newErrors.quantity = "Quantity is required";
    } else if (quantityValue <= 0) {
      newErrors.quantity = "Quantity must be greater than 0";
    } else if (!Number.isInteger(quantityValue)) {
      newErrors.quantity = "Quantity must be a whole number";
    } else if (
      selectedOpeningStockItem &&
      quantityValue > Number(selectedOpeningStockItem.availableQuantity)
    ) {
      newErrors.quantity =
        `Only ${selectedOpeningStockItem.availableQuantity} ${selectedOpeningStockItem.unit || ""} available in opening stock`.trim();
    }

    if (!form.rate) {
      newErrors.rate = "Rate is required";
    } else if (Number(form.rate) <= 0) {
      newErrors.rate = "Rate must be greater than 0";
    }

    if (!form.amount || Number(form.amount) <= 0) {
      newErrors.amount = "Amount must be greater than 0";
    }

    if (!form.description?.trim()) {
      newErrors.description = "Description is required";
    }

    if (form.discount && (form.discount < 0 || form.discount > 100)) {
      newErrors.discount = "Discount must be between 0–100";
    }

    setErrors(newErrors);

    return Object.keys(newErrors).length === 0;
  };
  const validateDispatch = () => {
    let newErrors = {};

    if (!dispatch.supplierRef?.trim()) {
      newErrors.supplierRef = "Supplier Ref is required";
    }

    if (!dispatch.dispatchDocNo?.trim()) {
      newErrors.dispatchDocNo = "Dispatch Doc No is required";
    }

    if (!dispatch.destination?.trim()) {
      newErrors.destination = "Destination is required";
    }

    if (!dispatch.creditDays) {
      newErrors.creditDays = "Credit Days is required";
    } else if (isNaN(dispatch.creditDays)) {
      newErrors.creditDays = "Must be a number";
    }

    if (!dispatch.dispatchThrough) {
      newErrors.dispatchThrough = "Select dispatch method";
    }

    if (dispatch.remarks && dispatch.remarks.length > 250) {
      newErrors.remarks = "Max 250 characters allowed";
    }

    if (!dispatch.termsType || dispatch.termsType === "Choose Terms Type") {
      newErrors.termsType = "Please select terms type";
    }

    if (!dispatch.terms?.trim()) {
      newErrors.terms = "Terms are required";
    }

    setErrors(newErrors);

    return Object.keys(newErrors).length === 0;
  };

  const [dispatch, setDispatch] = useState({
    supplierRef: "",
    dispatchDocNo: "",
    dispatchThrough: "",
    destination: "",
    creditDays: "",
    remarks: "",
    termsType: "",
    terms: "",
  });
  const TAX_RATE = 18;
  const [items, setItems] = useState([]);
  const [availableOpeningStock, setAvailableOpeningStock] = useState([]);
  const [isOpeningStockLoading, setIsOpeningStockLoading] = useState(false);
  const [selectedCurrency, setSelectedCurrency] = useState(() => {
    if (typeof window === "undefined") {
      return DEFAULT_CURRENCY;
    }

    return getCurrencyByCode(window.localStorage.getItem(CURRENCY_STORAGE_KEY));
  });

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(CURRENCY_STORAGE_KEY, selectedCurrency.code);
  }, [selectedCurrency]);

  useEffect(() => {
    let isMounted = true;

    const checkAccess = async () => {
      const storedAuth = getStoredAdminAuth();
      if (!storedAuth?.token) {
        clearStoredAdminAuth();
        if (isMounted) {
          setIsAuthorized(false);
          setIsCheckingAuth(false);
          router.replace("/");
        }
        return;
      }

      try {
        await verifyAdminAccess(storedAuth.token);
        if (isMounted) {
          setIsAuthorized(true);
          setIsCheckingAuth(false);
        }
      } catch {
        clearStoredAdminAuth();
        if (isMounted) {
          setIsAuthorized(false);
          setIsCheckingAuth(false);
          router.replace("/");
        }
      }
    };

    checkAccess();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const toDisplayInputValue = (value) => {
    if (value === "" || value === null || value === undefined) {
      return "";
    }

    return formatCurrencyValue(value, selectedCurrency);
  };

  const formatMoneyFromInrForCurrency = (value, currency) =>
    `${formatCurrencyPrefix(currency)}${formatCurrencyValue(value, currency)}`;

  const formatMoneyFromInr = (value) =>
    formatMoneyFromInrForCurrency(value, selectedCurrency);

  const getItemPayload = () => ({
    ...form,
    rate: Number(convertToInr(form.rate, selectedCurrency).toFixed(3)),
    amount: Number(convertToInr(form.amount, selectedCurrency).toFixed(3)),
  });

  const handleFormChange = (e) => {
    const { name, value } = e.target;

    const updatedForm = {
      ...form,
      [name]: value,
    };

    updatedForm.amount = getComputedAmount(
      updatedForm.rate,
      updatedForm.quantity,
      updatedForm.discount,
      selectedCurrency,
    );

    setForm(updatedForm);
  };
  const handleOpeningStockItemChange = (e) => {
    const selectedItem = availableOpeningStock.find(
      (item) => item.itemCode === e.target.value,
    );

    setForm((currentForm) => {
      const updatedForm = {
        ...currentForm,
        item_code: selectedItem?.itemCode || "",
        item_name: selectedItem?.itemName || "",
        unit: selectedItem?.unit || "",
        description:
          selectedItem?.itemDescription || currentForm.description || "",
        rate:
          selectedItem?.salesPrice || selectedItem?.salesPrice === 0
            ? toDisplayInputValue(selectedItem.salesPrice)
            : "",
      };

      updatedForm.amount = getComputedAmount(
        updatedForm.rate,
        updatedForm.quantity,
        updatedForm.discount,
        selectedCurrency,
      );

      return updatedForm;
    });
  };
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const addItem = async () => {
    if (!validateForm()) {
      toast.error("Please fix the errors");
      return;
    }

    try {
      const payload = getItemPayload();

      if (editId) {
        await axios.put(
          `${API_BASE_URL}/update-item/${editId}/`,
          payload,
          getAxiosAuthConfig(),
        );
        toast.success("Item updated successfully");
      } else {
        await axios.post(
          `${API_BASE_URL}/add-item/`,
          payload,
          getAxiosAuthConfig(),
        );
        toast.success("Item added successfully");
      }

      await getItems();
      await getAvailableOpeningStock(null);
      setPreviewData(null);

      setForm({
        ledger: "",
        bill_type: "",
        date: "",
        code: "",
        item_code: "",
        item_name: "",
        unit: "",
        quantity: "",
        rate: "",
        discount: "",
        description: "",
        amount: "",
      });

      setErrors({});
      setEditId(null);
    } catch (error) {
      console.error(error);
      const responseErrors = error?.response?.data;

      if (responseErrors && typeof responseErrors === "object") {
        const nextErrors = {};
        let firstMessage = "Operation failed";

        Object.entries(responseErrors).forEach(([field, value]) => {
          const message = Array.isArray(value) ? value[0] : value;
          if (typeof message === "string" && message.trim()) {
            nextErrors[field] = message;
            if (firstMessage === "Operation failed") {
              firstMessage = message;
            }
          }
        });

        if (Object.keys(nextErrors).length) {
          setErrors((currentErrors) => ({
            ...currentErrors,
            ...nextErrors,
          }));
        }

        toast.error(firstMessage);
        return;
      }

      toast.error("Operation failed");
    }
  };

  const [summary, setSummary] = useState({
    taxable: 0,
    tax: 0,
    discount: 0,
    subtotal: 0,
    roundoff: 0,
    net: 0,
  });

  const buildSummary = useCallback((itemsList) => {
    let subtotal = 0;
    let discountTotal = 0;

    itemsList.forEach((item) => {
      const qty = Number(item.quantity) || 0;
      const rate = Number(item.rate) || 0;
      const disc = Number(item.discount) || 0;

      const total = qty * rate;
      const discAmt = (total * disc) / 100;

      subtotal += total - discAmt;
      discountTotal += discAmt;
    });

    const tax = (subtotal * TAX_RATE) / 100;
    const net = subtotal + tax;

    const roundoff = Math.round(net) - net;

    return {
      taxable: subtotal,
      tax: tax,
      discount: discountTotal,
      subtotal: subtotal,
      roundoff: roundoff,
      net: net + roundoff,
    };
  }, []);

  const calculateSummary = useCallback(
    (itemsList) => {
      const nextSummary = buildSummary(itemsList);
      setSummary(nextSummary);
      return nextSummary;
    },
    [buildSummary],
  );

  const today = new Date();
  const formattedDate = today.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const getItems = useCallback(async () => {
    try {
      const res = await axios.get(
        `${API_BASE_URL}/items/`,
        getAxiosAuthConfig(),
      );
      const nextItems = Array.isArray(res.data)
        ? res.data.filter((item) => isListableSalesItem(item))
        : [];
      setItems(nextItems);
      calculateSummary(nextItems);
      return nextItems;
    } catch (err) {
      console.error(err);
      toast.error("Failed to fetch items");
      return [];
    }
  }, [calculateSummary]);

  const getAvailableOpeningStock = useCallback(async (excludeItemId = null) => {
    setIsOpeningStockLoading(true);

    try {
      const params = excludeItemId ? { exclude_item_id: excludeItemId } : {};
      const res = await axios.get(
        `${API_BASE_URL}/api/opening-stock/available/`,
        getAxiosAuthConfig({
          params,
        }),
      );
      setAvailableOpeningStock(
        Array.isArray(res.data?.items) ? res.data.items : [],
      );
    } catch (err) {
      console.error(err);
      setAvailableOpeningStock([]);
      toast.error("Failed to fetch opening stock");
    } finally {
      setIsOpeningStockLoading(false);
    }
  }, []);

  const deleteItem = async (id) => {
    try {
      await axios.delete(
        `${API_BASE_URL}/delete-item/${id}/`,
        getAxiosAuthConfig(),
      );
      showDeleteToast("Item deleted successfully");
      await getItems();
      await getAvailableOpeningStock(null);
      setPreviewData(null);
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete item");
    }
  };

  const editItem = (item) => {
    setForm({
      ledger: item.ledger || "",
      bill_type: item.bill_type || "",
      date: item.date || "",
      code: item.code || "",
      item_code: item.item_code || "",
      item_name: item.item_name || "",
      unit: item.unit || "",
      quantity: item.quantity || "",
      rate: toDisplayInputValue(item.rate),
      discount: item.discount || "",
      description: item.description || "",
      amount: toDisplayInputValue(item.amount),
    });

    setEditId(item.id);
    getAvailableOpeningStock(item.id);
  };

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    getItems();
    getAvailableOpeningStock(null);
  }, [getAvailableOpeningStock, getItems, isAuthorized]);
  const handleDispatchChange = (e) => {
    const { name, value } = e.target;
    setDispatch((prev) => {
      if (name === "termsType") {
        return {
          ...prev,
          termsType: value,
          terms: TERMS_BY_TYPE[value] || "",
        };
      }

      return {
        ...prev,
        [name]: value,
      };
    });
  };
  const sendToWhatsApp = async () => {
    if (!phoneNumber) {
      alert("Enter phone number");
      return false;
    }
    const phoneRegex = /^[0-9]{10}$/;

    if (!phoneRegex.test(phoneNumber)) {
      alert("Enter a valid 10-digit phone number");
      return false;
    }

    const message = `
     *Tk Powers*

Name: ${(previewData?.items || items)[0]?.ledger || form.ledger}
Date: ${form.date}

 Items:
${(previewData?.items || items)
  .map(
    (item, i) =>
      `${i + 1}. ${item.item_name}
   Qty: ${item.quantity} x ${formatMoneyFromInrForCurrency(item.rate, previewData?.currency || selectedCurrency)}
   Discount: ${item.discount}%
   Amount: ${formatMoneyFromInrForCurrency(item.amount, previewData?.currency || selectedCurrency)}`,
  )
  .join("\n\n")}

------------------------
Taxable: ${formatMoneyFromInrForCurrency((previewData?.summary || summary).taxable, previewData?.currency || selectedCurrency)}
Tax: ${formatMoneyFromInrForCurrency((previewData?.summary || summary).tax, previewData?.currency || selectedCurrency)}
Discount: ${formatMoneyFromInrForCurrency((previewData?.summary || summary).discount, previewData?.currency || selectedCurrency)}
*Net Amount: ${formatMoneyFromInrForCurrency((previewData?.summary || summary).net, previewData?.currency || selectedCurrency)}*
------------------------

Dispatch:
Ref: ${(previewData?.dispatch || dispatch).supplierRef}
Destination: ${(previewData?.dispatch || dispatch).destination}

Remarks:
${(previewData?.dispatch || dispatch).remarks || "Send Money"}

Thank you!
`;

    const url = `https://wa.me/91${phoneNumber}?text=${encodeURIComponent(message)}`;

    window.open(url, "_blank");

    await downloadPDF();

    setTimeout(() => {
      window.print();
    }, 500);

    setShowPhonePopup(false);
    setPhoneNumber("");
  };
  const handleSubmit = async () => {
    if (!items.length) {
      toast.error("Add at least one item before previewing");
      return;
    }

    if (!validateDispatch()) {
      toast.error("Please fix the dispatch details");
      return;
    }

    try {
      const latestItems = await getItems();
      if (!latestItems.length) {
        toast.error("Add at least one item before previewing");
        return;
      }
      const latestSummary = buildSummary(latestItems);
      setPreviewData({
        items: latestItems,
        summary: latestSummary,
        dispatch: { ...dispatch },
        currency: selectedCurrency,
      });

      await axios.post(
        `${API_BASE_URL}/api/dispatch-summary/`,
        {
          dispatch: {
            ...dispatch,
          },
          summary: {
            ...latestSummary,
          },
          currency: selectedCurrency,
        },
        getAxiosAuthConfig(),
      );

      toast.success("Dispatch saved successfully!");
      setShowPreview(true);
    } catch (error) {
      console.error(error);
      toast.error("Failed to save dispatch");
    }
  };
  const goToSalesView = () => {
    router.push("/salesview");
  };

  const thStyle = {
    border: "1px solid black",
    padding: "5px",
    textAlign: "left",
    backgroundColor: "#f2f2f2",
  };
  const tdStyle = {
    border: "1px solid black",
    padding: "5px",
    textAlign: "Left",
  };
  const rowStyle = {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "5px",
  };
  const selectedOpeningStockItem = availableOpeningStock.find(
    (item) => item.itemCode === form.item_code,
  );
  const previewItems = previewData?.items || items;
  const previewSummary = previewData?.summary || summary;
  const previewDispatch = previewData?.dispatch || dispatch;
  const previewCurrency = previewData?.currency || selectedCurrency;
  const previewPrimaryItem = previewItems[0] || {};
  const previewInvoiceNumber =
    previewDispatch.dispatchDocNo || previewPrimaryItem.code || "N/A";
  const previewInvoiceDate =
    previewPrimaryItem.date || form.date || formattedDate;
  const previewPurchaseOrderNo = previewDispatch.supplierRef || "N/A";
  const previewDestination = previewDispatch.destination || "Not provided";
  const previewPaymentTerms = previewDispatch.creditDays
    ? `${previewDispatch.creditDays} Days`
    : previewDispatch.termsType || "30 Days";
  const previewDueDate =
    getDueDateValue(previewInvoiceDate, previewDispatch.creditDays) || "N/A";
  const previewTermsContent =
    previewDispatch.terms || TERMS_BY_TYPE[previewDispatch.termsType] || "";
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);
  const countries = NORMALIZED_CURRENCY_OPTIONS;
  const handleSelect = (country) => {
    setForm((prev) => ({
      ...prev,
      rate:
        prev.rate === ""
          ? ""
          : formatCurrencyInputValue(
              convertCurrencyValue(prev.rate, selectedCurrency, country),
              country,
            ),
      amount:
        prev.amount === ""
          ? ""
          : formatCurrencyInputValue(
              convertCurrencyValue(prev.amount, selectedCurrency, country),
              country,
            ),
    }));
    setSelectedCurrency(country);
    setOpen(false);
  };
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (isCheckingAuth || !isAuthorized) {
    return null;
  }

  return (
    <>
      <div className={styles.card}>
        <div className={styles.topRightWrapper}>
          <h4>Sales Details</h4>
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <div
              ref={dropdownRef}
              style={{ position: "relative", display: "inline-block" }}
            >
              <button
                type="button"
                className={styles.topCash}
                onClick={() => setOpen((prev) => !prev)}
              >
                <FaMoneyBillWave size={20} />
              </button>

              {open && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    marginTop: "5px",
                    background: "#fff",
                    border: "1px solid #ccc",
                    borderRadius: "5px",
                    boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
                    zIndex: 1000,
                    minWidth: "160px",
                  }}
                >
                  {countries.map((c, i) => (
                    <div
                      key={i}
                      onClick={() => handleSelect(c)}
                      style={{
                        padding: "8px 12px",
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "#f0f0f0")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "#fff")
                      }
                    >
                      <span>{c.name}</span>
                      <span>{c.symbol}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={goToSalesView}
              className={styles.topRightButton}
            >
              <FaList size={20} />
            </button>
          </div>
        </div>
        <div className={styles.invoiceIntroCard}>
          <h6 className={styles.invoiceIntroTitle}>Add Sales invoice</h6>
          <div className={styles.invoiceIntroGrid}>
            <div className={styles.field}>
              <label>Ledger</label>
              <input
                type="text"
                name="ledger"
                placeholder="Ledger"
                value={form.ledger}
                onChange={handleFormChange}
                className={
                  errors.ledger ? "form-control is-invalid" : "form-control"
                }
              />
              {errors.ledger && (
                <div className="invalid-feedback">{errors.ledger}</div>
              )}
            </div>

            <div className={styles.field}>
              <label>Bill Type</label>
              <input
                type="text"
                name="bill_type"
                placeholder="Bill Type"
                value={form.bill_type}
                onChange={handleFormChange}
                className={
                  errors.bill_type ? "form-control is-invalid" : "form-control"
                }
              />
              {errors.bill_type && (
                <div className="invalid-feedback">{errors.bill_type}</div>
              )}
            </div>

            <div className={`${styles.field} ${styles.invoiceCompactField}`}>
              <label>Date</label>
              <input
                type="date"
                name="date"
                value={form.date}
                onChange={handleFormChange}
                className={
                  errors.date ? "form-control is-invalid" : "form-control"
                }
              />
              {errors.date && (
                <div className="invalid-feedback">{errors.date}</div>
              )}
            </div>

            <div className={`${styles.field} ${styles.invoiceCompactField}`}>
              <label>Code</label>
              <input
                type="text"
                name="code"
                placeholder="Code"
                value={form.code}
                onChange={handleFormChange}
                className={
                  errors.code ? "form-control is-invalid" : "form-control"
                }
              />
              {errors.code && (
                <div className="invalid-feedback">{errors.code}</div>
              )}
            </div>
          </div>
        </div>

        <div className={styles.itemSectionCard}>
          <h4 className={styles.itemSectionTitle}>Item details</h4>

          <div className={styles.itemSectionGridTop}>
            <div className={styles.field}>
              <label>Item Code</label>
              <input
                type="text"
                name="item_code"
                placeholder="Item Code"
                value={form.item_code}
                className={
                  errors.item_code ? "form-control is-invalid" : "form-control"
                }
                disabled
              />
              {errors.item_code && (
                <div className="invalid-feedback">{errors.item_code}</div>
              )}
            </div>

            <div className={styles.field}>
              <div className={styles.fieldLabelRow}>
                <label>Item Name</label>
                <p className={styles.avlQtyText}>
                  <span>Avl.Qty:</span>
                  <strong>
                    {selectedOpeningStockItem?.availableQuantity || 0}
                  </strong>
                </p>
              </div>
              <select
                name="item_name"
                value={form.item_code}
                onChange={handleOpeningStockItemChange}
                className={
                  errors.item_name ? "form-control is-invalid" : "form-control"
                }
                disabled={isOpeningStockLoading}
              >
                <option value="">
                  {isOpeningStockLoading
                    ? "Loading Opening Stock"
                    : availableOpeningStock.length
                      ? "Choose Item Name"
                      : "No Opening Stock Available"}
                </option>
                {availableOpeningStock.map((item) => (
                  <option key={item.itemCode} value={item.itemCode}>
                    {item.itemName}
                  </option>
                ))}
              </select>
              {errors.item_name && (
                <div className="invalid-feedback">{errors.item_name}</div>
              )}
            </div>

            <div className={styles.field}>
              <label>Unit</label>
              <input
                type="text"
                name="unit"
                placeholder="Unit"
                value={form.unit}
                className={
                  errors.unit ? "form-control is-invalid" : "form-control"
                }
                disabled
              />
              {errors.unit && (
                <div className="invalid-feedback">{errors.unit}</div>
              )}
            </div>

            <div className={styles.field}>
              <label>Quantity</label>
              <input
                type="number"
                name="quantity"
                placeholder="Enter Quantity"
                value={form.quantity}
                onChange={handleFormChange}
                min="0"
                max={selectedOpeningStockItem?.availableQuantity || undefined}
                className={
                  errors.quantity ? "form-control is-invalid" : "form-control"
                }
              />
              {errors.quantity && (
                <div className="invalid-feedback">{errors.quantity}</div>
              )}
            </div>

            <div className={styles.field}>
              <label>Rate</label>
              <input
                type="number"
                name="rate"
                placeholder="Rate"
                value={form.rate}
                onChange={handleFormChange}
                className={
                  errors.rate ? "form-control is-invalid" : "form-control"
                }
              />
              {errors.rate && (
                <div className="invalid-feedback">{errors.rate}</div>
              )}
            </div>
          </div>

          <div className={styles.itemSectionGridBottom}>
            <div className={styles.field}>
              <label>Discount (%)</label>
              <input
                type="number"
                name="discount"
                placeholder="Discount (%)"
                value={form.discount}
                onChange={handleFormChange}
                className={
                  errors.discount ? "form-control is-invalid" : "form-control"
                }
              />
              {errors.discount && (
                <div className="invalid-feedback">{errors.discount}</div>
              )}
            </div>

            <div className={`${styles.field} ${styles.descriptionField}`}>
              <label>Description</label>
              <input
                type="text"
                name="description"
                placeholder="Description"
                value={form.description}
                onChange={handleFormChange}
                className={
                  errors.description
                    ? "form-control is-invalid"
                    : "form-control"
                }
                maxLength={150}
              />
              {errors.description && (
                <div className="invalid-feedback">{errors.description}</div>
              )}
            </div>

            <div className={styles.field}>
              <label>Amount</label>
              <input
                type="number"
                name="amount"
                placeholder="Amount"
                value={form.amount}
                onChange={handleFormChange}
                className={
                  errors.amount ? "form-control is-invalid" : "form-control"
                }
                readOnly
              />
              {errors.amount && (
                <div className="invalid-feedback">{errors.amount}</div>
              )}
            </div>

            <div className={styles.itemActionField}>
              <button className={styles.addBtn} type="button" onClick={addItem}>
                {editId ? "Update" : "Add"}
              </button>
            </div>
          </div>

          <div className={styles.itemsTableSection}>
            <h4 className={styles.itemsTableTitle}>Items List</h4>

            <div className={styles.tableResponsive}>
              <table className={styles.itemsTable}>
                <thead>
                  <tr>
                    <th>Item Code</th>
                    <th>Item Name</th>
                    <th>Unit</th>
                    <th>Quantity</th>
                    <th>Rate</th>
                    <th>Discount</th>
                    <th>Amount</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, index) => (
                    <tr key={item.id ?? index}>
                      <td>{item.item_code}</td>
                      <td>{item.item_name}</td>
                      <td>{item.unit}</td>
                      <td>{item.quantity}</td>
                      <td>{formatMoneyFromInr(item.rate)}</td>
                      <td>{item.discount}</td>
                      <td>{formatMoneyFromInr(item.amount)}</td>
                      <td>
                        <div className={styles.actionButtons}>
                          <button
                            className={styles.edit}
                            onClick={() => editItem(item)}
                            type="button"
                          >
                            <FaEdit />
                          </button>

                          <button
                            className={styles.delete}
                            onClick={() => deleteItem(item.id)}
                            type="button"
                          >
                            <FaTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  <tr>
                    <td className={styles.totalLabelCell} colSpan="6">
                      Total
                    </td>
                    <td className={styles.totalValueCell}>
                      {formatMoneyFromInr(
                        items.reduce(
                          (total, item) => total + Number(item.amount),
                          0,
                        ),
                      )}
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className={styles.detailCardsGrid}>
          <div className={styles.detailCard}>
            <h5 className={styles.detailCardTitle}>Dispatch Details</h5>

            <div className={styles.dispatchCardGrid}>
              <div className={styles.field}>
                <label>Supplier&apos;s Ref</label>
                <input
                  type="text"
                  className={`form-control ${errors.supplierRef ? "is-invalid" : ""}`}
                  name="supplierRef"
                  value={dispatch.supplierRef}
                  onChange={handleDispatchChange}
                  required
                />
                {errors.supplierRef && (
                  <div className="invalid-feedback">{errors.supplierRef}</div>
                )}
              </div>

              <div className={styles.field}>
                <label>Dispatch Doc No</label>
                <input
                  type="text"
                  className={`form-control ${errors.dispatchDocNo ? "is-invalid" : ""}`}
                  name="dispatchDocNo"
                  value={dispatch.dispatchDocNo}
                  onChange={handleDispatchChange}
                  required
                />
                {errors.dispatchDocNo && (
                  <div className="invalid-feedback">{errors.dispatchDocNo}</div>
                )}
              </div>

              <div className={styles.field}>
                <label>Dispatch Through</label>
                <select
                  className={`form-select ${errors.dispatchThrough ? "is-invalid" : ""}`}
                  name="dispatchThrough"
                  value={dispatch.dispatchThrough}
                  onChange={handleDispatchChange}
                >
                  <option value="">Choose dispatch method</option>
                  <option value="Speed post">Speed post</option>
                  <option value="Handy Delivery">Handy Delivery</option>
                  <option value="customer picked in shop">
                    customer picked in shop
                  </option>
                </select>
                {errors.dispatchThrough && (
                  <div className="invalid-feedback">
                    {errors.dispatchThrough}
                  </div>
                )}
              </div>

              <div className={styles.field}>
                <label>Destination</label>
                <input
                  type="text"
                  className={`form-control ${errors.destination ? "is-invalid" : ""}`}
                  name="destination"
                  value={dispatch.destination}
                  onChange={handleDispatchChange}
                  required
                />
                {errors.destination && (
                  <div className="invalid-feedback">{errors.destination}</div>
                )}
              </div>

              <div
                className={`${styles.field} ${styles.dispatchFieldFullWidth}`}
              >
                <label>Credit Days</label>
                <input
                  type="text"
                  className={`form-control ${errors.creditDays ? "is-invalid" : ""}`}
                  name="creditDays"
                  value={dispatch.creditDays}
                  onChange={handleDispatchChange}
                  required
                />
                {errors.creditDays && (
                  <div className="invalid-feedback">{errors.creditDays}</div>
                )}
              </div>
            </div>
          </div>

          <div className={styles.detailCard}>
            <div className={styles.noteCardSection}>
              <h5 className={styles.detailCardTitle}>Note</h5>
              <div className={styles.field}>
                <label>Remarks</label>
                <textarea
                  className={`form-control ${errors.remarks ? "is-invalid" : ""}`}
                  rows="3"
                  name="remarks"
                  value={dispatch.remarks}
                  onChange={handleDispatchChange}
                />
                {errors.remarks && (
                  <div className="invalid-feedback">{errors.remarks}</div>
                )}
              </div>
            </div>

            <div className={styles.noteCardSection}>
              <h5 className={styles.detailCardTitle}>Terms</h5>
              <div className={styles.field}>
                <label>Terms Type</label>
                <select
                  className={`form-select ${errors.termsType ? "is-invalid" : ""}`}
                  name="termsType"
                  value={dispatch.termsType}
                  onChange={handleDispatchChange}
                >
                  <option value="">Choose Terms Type</option>
                  <option value="Payment Terms">Payment Terms</option>
                  <option value="Delivery Terms">Delivery Terms</option>
                  <option value="General Terms">General Terms</option>
                </select>
                {errors.termsType && (
                  <div className="invalid-feedback">{errors.termsType}</div>
                )}
              </div>
              <div className={styles.field}>
                <label>Terms</label>
                <textarea
                  className={`form-control ${errors.terms ? "is-invalid" : ""}`}
                  rows="4"
                  name="terms"
                  value={dispatch.terms}
                  onChange={handleDispatchChange}
                  placeholder="Enter terms here"
                />
                {errors.terms && (
                  <div className="invalid-feedback">{errors.terms}</div>
                )}
              </div>
            </div>
          </div>

          <div className={styles.detailCard}>
            <h5 className={styles.detailCardTitle}>Summary</h5>

            <ul className={styles.summaryList}>
              <li className={styles.summaryItem}>
                <span>Taxable Amount</span>
                <span>{formatMoneyFromInr(summary.taxable)}</span>
              </li>

              <li className={styles.summaryItem}>
                <span>Tax Amount</span>
                <span>{formatMoneyFromInr(summary.tax)}</span>
              </li>

              <li className={styles.summaryItem}>
                <span>Discount Amount</span>
                <span>{formatMoneyFromInr(summary.discount)}</span>
              </li>

              <li className={styles.summaryItem}>
                <span>Subtotal</span>
                <span>{formatMoneyFromInr(summary.subtotal)}</span>
              </li>

              <li className={styles.summaryItem}>
                <span>Round Off</span>
                <span>{formatMoneyFromInr(summary.roundoff)}</span>
              </li>

              <li
                className={`${styles.summaryItem} ${styles.summaryItemEmphasis}`}
              >
                <span>Net Amount</span>
                <span>{formatMoneyFromInr(summary.net)}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="row mt-3">
          <div className="col d-flex gap-2">
            <button className={styles.submitBtn} onClick={handleSubmit}>
              SUBMIT
            </button>

            <button className={styles.cancelBtn} onClick={handleCancel}>
              CANCEL
            </button>
          </div>
        </div>
      </div>
      <ToastContainer position="top-right" autoClose={3000} />
      {showPhonePopup && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div
            style={{
              background: "#fff",
              padding: "20px",
              borderRadius: "10px",
              width: "300px",
            }}
          >
            <h5>Enter WhatsApp Number</h5>

            <input
              type="text"
              className="form-control mb-3"
              placeholder="10 digit number"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />

            <div className="d-flex justify-content-end gap-2">
              <button
                className="btn btn-secondary"
                onClick={() => setShowPhonePopup(false)}
              >
                Cancel
              </button>

              <button className="btn btn-success" onClick={sendToWhatsApp}>
                Send
              </button>
            </div>
          </div>
        </div>
      )}
      {showPreview && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: "#000000aa",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            overflow: "auto",
            padding: "20px",
            marginLeft: "30px",
            zIndex: 1000,

          }}
        >
          <div
            style={{
              background: "#c1c2c4",
              padding: "20px",
              width: "100%",
              height: "100%",
              overflow: "auto",
            }}
          >
            <div
              id="preview-area"
              style={{
                width: "210mm",
                minHeight: "297mm",
                margin: "auto",
                padding: "20px",
                background: "#fff",
                fontFamily: "inherit",
                boxShadow: "0 0 10px rgba(0,0,0,0.2)",
                borderRadius: "5px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderBottom: "1px solid black",
                  paddingBottom: "10px",
                }}
              >
                <img
                  src="/logo.png"
                  alt="logo"
                  style={{ width: "100px", height: "50px" }}
                />
                <div style={{ textAlign: "right" }}>
                  <h5
                    style={{
                      margin: 0,
                      fontFamily: "inherit",
                      fontSize: "16px",
                      color: "#0077b6",
                    }}
                  >
                    TK POWER SOURCE
                  </h5>
                  <p style={{ margin: "2px 0", fontSize: "10px" }}>
                    GSTIN: 33AACFV3825E2ZG
                  </p>
                  <p style={{ margin: "2px 0", fontSize: "10px" }}>
                    Phone: 9344001577
                  </p>
                  <p style={{ margin: "2px 0", fontSize: "10px" }}>
                    Email: tkpowersource@gmail.com
                  </p>
                  <p style={{ margin: "2px 0", fontSize: "10px" }}>
                    72C Thanneerpanthal Colony, Annuparpalayam P.O, Tiruppur
                  </p>
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "20px",
                  marginTop: "10px",
                  fontSize: "10px",
                }}
              >
                <div style={{ flex: 1, padding: "10px" }}>
                  <p
                    style={{
                      textAlign: "left",
                      fontWeight: "bold",
                      marginBottom: "10px",
                      fontSize: "12px",
                    }}
                  >
                    Billing Details
                  </p>
                  <p>
                    <b>Biller Name:</b> TK POWER SOURCE
                  </p>
                  <p>
                    <b>Address:</b> NO. 244/1, MUTHANAMPALAYAM ROAD, THIRUPUR
                  </p>
                  <p>
                    <b>GSTIN:</b> 33AAICV4929J1ZZ
                  </p>
                </div>

                <div style={{ flex: 1, padding: "10px" }}>
                  <p
                    style={{
                      textAlign: "left",
                      fontWeight: "bold",
                      marginBottom: "10px",
                      fontSize: "12px",
                    }}
                  >
                    Invoice Details
                  </p>
                  <p>
                    <b>Invoice No:</b> {previewInvoiceNumber}
                  </p>
                  <p>
                    <strong>Date:</strong> {previewInvoiceDate}
                  </p>
                  <p>
                    <b>PO No:</b> {previewPurchaseOrderNo}
                  </p>
                </div>

                <div style={{ flex: 1, padding: "5px" }}>
                  <p
                    style={{
                      textAlign: "left",
                      fontWeight: "bold",
                      marginBottom: "10px",
                      fontSize: "12px",
                    }}
                  >
                    Delivery Address
                  </p>
                  <p>{previewDestination}</p>
                </div>
              </div>

              <br />

              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                }}
              >
                <thead>
                  <tr style={{}}>
                    <th style={thStyle}>#</th>
                    <th style={thStyle}>Item</th>

                    <th style={thStyle}>Qty</th>
                    <th style={thStyle}>Rate</th>
                    <th style={thStyle}>Disc(%)</th>
                    <th style={thStyle}>Amount</th>
                  </tr>
                </thead>

                <tbody>
                  {previewItems.map((item, i) => (
                    <tr key={i}>
                      <td style={tdStyle}>{i + 1}</td>
                      <td style={tdStyle}>
                        {item.item_name} <br />
                        <span style={{ fontSize: "11px" }}>
                          <i>{item.description}</i>
                        </span>
                      </td>
                      <td style={tdStyle}>{item.quantity}</td>
                      <td style={tdStyle}>
                        {formatMoneyFromInrForCurrency(
                          item.rate,
                          previewCurrency,
                        )}
                      </td>
                      <td style={tdStyle}>{item.discount || "0"}%</td>
                      <td style={tdStyle}>
                        {formatMoneyFromInrForCurrency(
                          item.amount,
                          previewCurrency,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <br />

              <div style={{ display: "flex", gap: "20px", marginTop: "20px" }}>
                <div
                  style={{
                    flex: 2,

                    borderRadius: "5px",
                    minWidth: "200px",
                    fontSize: "12px",
                  }}
                >
                  <p style={{ fontWeight: "bold", marginBottom: "5px" }}>
                    <u>Terms And Conditions:</u>
                  </p>
                  <ol style={{ paddingLeft: "10px", margin: 0 }}>
                    <li>
                      Goods once sold will not be taken back or exchanged.
                    </li>
                    <li>Warranty as per company norms.</li>
                    <li>
                      For any complaints, please contact the dealer within 7
                      days of purchase.
                    </li>
                    <li>Subject to state jurisdiction.</li>
                  </ol>
                  <br />
                  <div
                    style={{
                      border: "1px solid black",
                      padding: "10px",
                      width: "100%",
                      fontSize: "12px",
                    }}
                  >
                    <p
                      style={{
                        fontWeight: "bold",
                        borderBottom: "1px solid black",
                      }}
                    >
                      Payment Details
                    </p>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "5px",
                      }}
                    >
                      <span>Payment Terms:</span>
                      <span>{previewPaymentTerms}</span>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "5px",
                      }}
                    >
                      <span>Due Date:</span>
                      <span>{previewDueDate}</span>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "5px",
                      }}
                    >
                      <span>Interest Beyond Due Date:</span>
                      <span>18%</span>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: "5px",
                      }}
                    >
                      <span>Payment In Favour Of:</span>
                      <span>
                        {previewDispatch.dispatchThrough || "kumar industries"}
                      </span>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginTop: "5px",
                        fontWeight: "bold",
                      }}
                    >
                      <span>{previewCurrency.amountLabel}:</span>
                      <span>
                        {formatMoneyFromInrForCurrency(
                          previewSummary.net,
                          previewCurrency,
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    flex: 1,
                    border: "1px solid black",
                    padding: "5px",
                    minWidth: "250px",
                    height: "280px",
                  }}
                >
                  <p
                    style={{
                      borderBottom: "1px solid black",
                      fontWeight: "bold",
                      paddingBottom: "12px",
                      textAlign: "center",
                      marginTop: "10px",
                    }}
                  >
                    Summary
                    <br />
                    Taxable amount and GST charged as per applicable laws.
                  </p>

                  <div style={rowStyle}>
                    <span>Taxable</span>
                    <span>
                      {formatMoneyFromInrForCurrency(
                        previewSummary.taxable,
                        previewCurrency,
                      )}
                    </span>
                  </div>

                  <div style={rowStyle}>
                    <span>Tax</span>
                    <span>
                      {formatMoneyFromInrForCurrency(
                        previewSummary.tax,
                        previewCurrency,
                      )}
                    </span>
                  </div>

                  <div style={rowStyle}>
                    <span>Discount</span>
                    <span>
                      {formatMoneyFromInrForCurrency(
                        previewSummary.discount,
                        previewCurrency,
                      )}
                    </span>
                  </div>

                  <div style={rowStyle}>
                    <span>Subtotal</span>
                    <span>
                      {formatMoneyFromInrForCurrency(
                        previewSummary.subtotal,
                        previewCurrency,
                      )}
                    </span>
                  </div>

                  <div style={rowStyle}>
                    <span>Round Off</span>
                    <span>
                      {formatMoneyFromInrForCurrency(
                        previewSummary.roundoff,
                        previewCurrency,
                      )}
                    </span>
                  </div>

                  <hr />

                  <div style={{ ...rowStyle, fontWeight: "bold" }}>
                    <span>Net Amount</span>
                    <span>
                      {formatMoneyFromInrForCurrency(
                        previewSummary.net,
                        previewCurrency,
                      )}
                    </span>
                  </div>
                </div>
              </div>
              <br />
              <div
                style={{
                  display: "flex",
                  gap: "20px",
                  marginTop: "20px",
                  flexWrap: "wrap",
                  fontSize: "12px",
                }}
              >
                <div
                  style={{
                    flex: 1,
                    border: "1px solid black",
                    padding: "10px",
                    minWidth: "250px",
                  }}
                >
                  <p
                    style={{
                      fontWeight: "bold",
                      marginBottom: "8px",
                      fontSize: "12px",
                    }}
                  >
                    <u>Bank Details</u>
                  </p>
                  <p>
                    <b>Bank:</b> PUNJAB NATIONAL BANK
                  </p>
                  <p>
                    <b>A/C No:</b> 4402 0087 0004 4467
                  </p>
                  <p>
                    <b>Branch:</b> TIRUPUR AVINASHI ROAD
                  </p>
                  <p>
                    <b>IFSC:</b> PUNB0440200
                  </p>
                </div>

                <div
                  style={{
                    flex: 1,
                    border: "1px solid black",
                    padding: "10px",
                    minWidth: "250px",
                  }}
                >
                  <p
                    style={{
                      fontWeight: "bold",
                      marginBottom: "8px",
                      textAlign: "left",
                      fontSize: "12px",
                    }}
                  >
                    <u>Description:</u>
                  </p>
                </div>
              </div>

              <br />
              <br />
              <br />
              <div
                className={styles.termsContainer}
                style={{ padding: "20px", lineHeight: "1.4" }}
              >
                <h4>Terms & Conditions</h4>
                {previewDispatch.termsType && (
                  <p style={{ fontWeight: "bold", marginBottom: "8px" }}>
                    {previewDispatch.termsType}
                  </p>
                )}
                <p style={{ marginBottom: 0, whiteSpace: "pre-line" }}>
                  {previewTermsContent || "No terms selected."}
                </p>
              </div>
              <div
                style={{
                  marginTop: "40px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-end",
                }}
              >
                <p>Customer Signature</p>

                <div style={{ textAlign: "center" }}>
                  <img
                    src="/logo.png"
                    alt="stamp"
                    style={{ width: "80px", height: "50px" }}
                  />
                  <p>Authorized Signature</p>
                </div>
              </div>
            </div>
          </div>

          <div className="d-flex justify-content-end gap-2 mt-3">
            <button
              className="btn btn-secondary"
              onClick={() => setShowPreview(false)}
            >
              Cancel
            </button>

            <button onClick={downloadPDF} className="btn btn-danger">
              Download PDF
            </button>

            <button
              className="btn btn-success"
              onClick={() => {
                setShowPreview(false);
                setShowPhonePopup(true);
              }}
            >
              Send WhatsApp
            </button>
          </div>
        </div>
      )}
    </>
  );
}
