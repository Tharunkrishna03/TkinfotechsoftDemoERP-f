"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FaThList } from "react-icons/fa";
import { ToastContainer, toast } from "react-toastify";

import { fetchWithAdminAuth } from "@/lib/admin-auth";
import { useAdminPageAccess } from "@/lib/use-admin-page-access";
import { savePurchaseOrderNotification } from "@/lib/workflow-notifications";
import { getApiErrorMessage, getTodayValue } from "../quotation/shared";

import "react-toastify/dist/ReactToastify.css";

import styles from "../quotation/quotation.module.css";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

const ERROR_BANNER_STYLE = {
  marginBottom: "14px",
  padding: "12px 14px",
  border: "1px solid rgba(231, 84, 128, 0.28)",
  borderRadius: "12px",
  background: "rgba(255, 78, 124, 0.08)",
  color: "#b42355",
  fontSize: "12px",
  fontWeight: 600,
};

function createInitialFormValues(overrides = {}) {
  const today = getTodayValue();
  return {
    quotationId: "",
    costEstimationNo: "",
    purchaseOrderNo: "",
    poDate: today,
    poReceivedDate: today,
    expectedDate: "",
    ...overrides,
  };
}

function isPdfFile(file) {
  if (!file) {
    return false;
  }

  const type = String(file.type || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();
  return type === "application/pdf" || name.endsWith(".pdf");
}

function mapServerErrors(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return {};
  }

  return Object.entries(source).reduce((accumulator, [key, value]) => {
    const message = getApiErrorMessage(value, "");
    if (message) {
      accumulator[key] = message;
    }
    return accumulator;
  }, {});
}

async function requestPurchaseOrderCatalog() {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/purchase-order/catalog/`, {
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, "Failed to load accepted quotations."));
  }

  return Array.isArray(data.quotations) ? data.quotations : [];
}

async function requestNextPurchaseOrderNumber(poDate) {
  const query = poDate ? `?poDate=${encodeURIComponent(poDate)}` : "";
  const response = await fetchWithAdminAuth(
    `${API_BASE_URL}/api/purchase-order/next-number/${query}`,
    {
      cache: "no-store",
    },
  );
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, "Failed to load purchase order number."));
  }

  return String(data.purchaseOrderNo || "").trim();
}

async function requestPurchaseOrderDetail(id) {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/purchase-order/${id}/`, {
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, "Failed to load purchase order."));
  }

  return data;
}

async function savePurchaseOrder(payload) {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/purchase-order/`, {
    method: "POST",
    body: payload,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(getApiErrorMessage(data, "Failed to save purchase order."));
    error.data = data;
    throw error;
  }

  return data;
}

async function updatePurchaseOrder(id, payload) {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/purchase-order/${id}/`, {
    method: "PUT",
    body: payload,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(getApiErrorMessage(data, "Failed to update purchase order."));
    error.data = data;
    throw error;
  }

  return data;
}

function PurchaseOrderPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const fileInputRef = useRef(null);
  const editingPurchaseOrderId = searchParams.get("purchaseOrderId");
  const isJobCardMode = pathname === "/opening-job-card";
  const listPath = isJobCardMode ? "/job-card-queue" : "/purchase-order-list";
  const { isCheckingAuth, isAuthorized } = useAdminPageAccess(router);
  const [catalog, setCatalog] = useState([]);
  const [editingPurchaseOrder, setEditingPurchaseOrder] = useState(null);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [isLoadingPurchaseOrder, setIsLoadingPurchaseOrder] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [errors, setErrors] = useState({});
  const [poReferenceFile, setPoReferenceFile] = useState(null);
  const [existingReferenceUrl, setExistingReferenceUrl] = useState("");
  const [formValues, setFormValues] = useState(() => createInitialFormValues());

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    let isMounted = true;
    setIsLoadingCatalog(true);

    requestPurchaseOrderCatalog()
      .then((rows) => {
        if (!isMounted) {
          return;
        }
        setCatalog(rows);
        setErrorMessage("");
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }
        setErrorMessage(error.message || "Failed to load accepted quotations.");
        toast.error(error.message || "Failed to load accepted quotations.");
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingCatalog(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isAuthorized]);

  useEffect(() => {
    if (!isAuthorized || !editingPurchaseOrderId) {
      return;
    }

    let isMounted = true;
    setIsLoadingPurchaseOrder(true);

    requestPurchaseOrderDetail(editingPurchaseOrderId)
      .then((purchaseOrder) => {
        if (!isMounted) {
          return;
        }

        setEditingPurchaseOrder(purchaseOrder);
        setExistingReferenceUrl(purchaseOrder.poReference || "");
        setPoReferenceFile(null);
        setErrors({});
        setErrorMessage("");
        setFormValues(
          createInitialFormValues({
            quotationId: String(purchaseOrder.quotation || ""),
            costEstimationNo: purchaseOrder.costEstimationNo || "",
            purchaseOrderNo: purchaseOrder.purchaseOrderNo || "",
            poDate: purchaseOrder.poDate || getTodayValue(),
            poReceivedDate: purchaseOrder.poReceivedDate || getTodayValue(),
            expectedDate: purchaseOrder.expectedDate || "",
          }),
        );

        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }
        setErrorMessage(error.message || "Failed to load purchase order.");
        toast.error(error.message || "Failed to load purchase order.");
      })
      .finally(() => {
        if (isMounted) {
          setIsLoadingPurchaseOrder(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [editingPurchaseOrderId, isAuthorized]);

  useEffect(() => {
    if (!isAuthorized || editingPurchaseOrderId || !formValues.poDate) {
      return;
    }

    let isMounted = true;
    const requestedDate = formValues.poDate;

    requestNextPurchaseOrderNumber(requestedDate)
      .then((purchaseOrderNo) => {
        if (!isMounted) {
          return;
        }
        setFormValues((currentValues) =>
          currentValues.poDate === requestedDate
            ? {
                ...currentValues,
                purchaseOrderNo,
              }
            : currentValues,
        );
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }
        toast.error(error.message || "Failed to load purchase order number.");
      });

    return () => {
      isMounted = false;
    };
  }, [editingPurchaseOrderId, formValues.poDate, isAuthorized]);

  const quotationOptions = useMemo(() => {
    if (!editingPurchaseOrder) {
      return catalog;
    }

    const currentOption = {
      id: editingPurchaseOrder.quotation,
      quotationCode: editingPurchaseOrder.quotationCode,
      attentionName: editingPurchaseOrder.attentionName,
      companyName: editingPurchaseOrder.companyName,
      referenceNo: editingPurchaseOrder.referenceNo,
      costEstimationNo: editingPurchaseOrder.costEstimationNo,
    };

    return [
      currentOption,
      ...catalog.filter((quotation) => quotation.id !== currentOption.id),
    ];
  }, [catalog, editingPurchaseOrder]);

  const selectedQuotation =
    quotationOptions.find((quotation) => String(quotation.id) === String(formValues.quotationId)) ||
    null;

  useEffect(() => {
    setFormValues((currentValues) => ({
      ...currentValues,
      costEstimationNo: selectedQuotation?.costEstimationNo || "",
    }));
  }, [selectedQuotation]);

  const pageTitle = editingPurchaseOrderId
    ? isJobCardMode
      ? "Edit Job Card"
      : "Edit Purchase Order"
    : isJobCardMode
      ? "Opening Job Card"
      : "Purchase Order";
  const sectionTitle = isJobCardMode ? "Job Card Details" : "Purchase Order Details";
  const sectionSubtitle = isJobCardMode
    ? "Create or update a job card from a client-accepted quotation."
    : "Create or update a purchase order from a client-accepted quotation.";

  const clearFieldErrors = (...fieldNames) => {
    if (!fieldNames.length) {
      return;
    }

    setErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };
      fieldNames.forEach((fieldName) => delete nextErrors[fieldName]);
      return nextErrors;
    });
  };

  const handleFieldChange = (event) => {
    const { name, value } = event.target;

    setFormValues((currentValues) => ({
      ...currentValues,
      [name]: value,
    }));
    clearFieldErrors(name);
    setErrorMessage("");
  };

  const handleFileChange = (event) => {
    const nextFile = event.target.files?.[0] || null;

    if (nextFile && !isPdfFile(nextFile)) {
      setPoReferenceFile(null);
      setErrors((currentErrors) => ({
        ...currentErrors,
        poReference: "Upload a PDF file only.",
      }));
      event.target.value = "";
      toast.error("Upload a PDF file only.");
      return;
    }

    setPoReferenceFile(nextFile);
    clearFieldErrors("poReference");
    setErrorMessage("");
  };

  const validateForm = () => {
    const nextErrors = {};

    if (!selectedQuotation) {
      nextErrors.quotationId = "Select a quotation.";
    }

    if (!formValues.purchaseOrderNo) {
      nextErrors.purchaseOrderNo = "Purchase order number is required.";
    }

    if (!formValues.poDate) {
      nextErrors.poDate = "PO date is required.";
    }

    if (!formValues.poReceivedDate) {
      nextErrors.poReceivedDate = "PO received date is required.";
    }

    if (!formValues.expectedDate) {
      nextErrors.expectedDate = "Expected date is required.";
    } else if (
      formValues.poReceivedDate &&
      formValues.expectedDate < formValues.poReceivedDate
    ) {
      nextErrors.expectedDate = "Expected date cannot be before the PO received date.";
    }

    if (!editingPurchaseOrderId && !poReferenceFile) {
      nextErrors.poReference = "Upload a PO reference PDF.";
    } else if (poReferenceFile && !isPdfFile(poReferenceFile)) {
      nextErrors.poReference = "Upload a PDF file only.";
    }

    setErrors(nextErrors);
    return !Object.keys(nextErrors).length;
  };

  const resetCreateForm = async () => {
    const today = getTodayValue();
    const purchaseOrderNo = await requestNextPurchaseOrderNumber(today);
    setFormValues(
      createInitialFormValues({
        poDate: today,
        poReceivedDate: today,
        purchaseOrderNo,
      }),
    );
    setPoReferenceFile(null);
    setExistingReferenceUrl("");
    setErrors({});
    setErrorMessage("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleCancel = async () => {
    if (editingPurchaseOrderId) {
      router.push(listPath);
      return;
    }

    try {
      await resetCreateForm();
    } catch (error) {
      setFormValues(createInitialFormValues());
      setPoReferenceFile(null);
      setExistingReferenceUrl("");
      setErrors({});
      setErrorMessage("");
      toast.error(error.message || "Failed to load purchase order number.");
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!validateForm()) {
      toast.error(`Please fix the ${isJobCardMode ? "job card" : "purchase order"} details.`);
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = new FormData();
      payload.append("quotationId", formValues.quotationId);
      payload.append("poDate", formValues.poDate);
      payload.append("poReceivedDate", formValues.poReceivedDate);
      payload.append("expectedDate", formValues.expectedDate);
      if (poReferenceFile) {
        payload.append("poReference", poReferenceFile);
      }

      const response = editingPurchaseOrderId
        ? await updatePurchaseOrder(editingPurchaseOrderId, payload)
        : await savePurchaseOrder(payload);

      if (editingPurchaseOrderId) {
        toast.success(response.message || "Purchase order updated successfully");
        router.push(listPath);
        return;
      }

      savePurchaseOrderNotification({
        quotationId: response?.data?.quotation || formValues.quotationId,
        quotationCode: response?.data?.quotationCode || selectedQuotation?.quotationCode || "",
        purchaseOrderNo: response?.data?.purchaseOrderNo || "",
      });

      const [nextCatalog, nextPurchaseOrderNo] = await Promise.all([
        requestPurchaseOrderCatalog(),
        requestNextPurchaseOrderNumber(getTodayValue()),
      ]);

      setCatalog(nextCatalog);
      setFormValues(
        createInitialFormValues({
          poDate: getTodayValue(),
          poReceivedDate: getTodayValue(),
          purchaseOrderNo: nextPurchaseOrderNo,
        }),
      );
      setPoReferenceFile(null);
      setExistingReferenceUrl("");
      setErrors({});
      setErrorMessage("");

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }

      toast.success(response.message || "Purchase order saved successfully");
    } catch (error) {
      const nextErrors = mapServerErrors(error.data);
      setErrors(nextErrors);
      setErrorMessage(
        error.message ||
          `Failed to ${editingPurchaseOrderId ? "update" : "save"} purchase order.`,
      );
      toast.error(
        error.message ||
          `Failed to ${editingPurchaseOrderId ? "update" : "save"} purchase order.`,
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isCheckingAuth || !isAuthorized || isLoadingPurchaseOrder) {
    return null;
  }

  return (
    <>
      <main className={styles.contentArea}>
        <section className={styles.card}>
          <div className={styles.topRightWrapper}>
            <div>
              <h1 className={styles.pageTitle}>{pageTitle}</h1>
              <p className={styles.pageSubtitle}>{sectionSubtitle}</p>
            </div>
            <div className={styles.headerActions}>
              <button
                type="button"
                className={styles.topIconButton}
                onClick={() => router.push(listPath)}
                title={isJobCardMode ? "Open job card queue" : "Open purchase order list"}
                aria-label={isJobCardMode ? "Open job card queue" : "Open purchase order list"}
              >
                <FaThList />
              </button>
            </div>
          </div>

          {errorMessage ? <div style={ERROR_BANNER_STYLE}>{errorMessage}</div> : null}

          <form onSubmit={handleSubmit}>
            <div className={styles.invoiceIntroCard}>
              <div className={styles.sectionTitleRow}>
                <h2 className={styles.sectionTitle}>{sectionTitle}</h2>
              </div>

              <div className={styles.invoiceIntroGrid}>
                <div className={styles.field}>
                  <label htmlFor="quotationId">Quotation no</label>
                  <select
                    id="quotationId"
                    name="quotationId"
                    className={`${styles.fieldInput} ${
                      errors.quotationId ? styles.fieldInputError : ""
                    }`}
                    value={formValues.quotationId}
                    onChange={handleFieldChange}
                    disabled={
                      isLoadingCatalog ||
                      isSubmitting ||
                      !quotationOptions.length ||
                      Boolean(editingPurchaseOrderId)
                    }
                  >
                    <option value="">
                      {isLoadingCatalog ? "Loading accepted quotations..." : "Select quotation"}
                    </option>
                    {quotationOptions.map((quotation) => (
                      <option key={quotation.id} value={quotation.id}>
                        {quotation.quotationCode || "-"} - {quotation.attentionName || "-"}
                      </option>
                    ))}
                  </select>
                  {errors.quotationId ? (
                    <p className={styles.fieldError}>{errors.quotationId}</p>
                  ) : null}
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
                  <label htmlFor="purchaseOrderNo">
                    {isJobCardMode ? "Job card no" : "Purchase order no"}
                  </label>
                  <input
                    id="purchaseOrderNo"
                    className={`${styles.fieldInput} ${styles.autoGeneratedInput} ${
                      errors.purchaseOrderNo ? styles.fieldInputError : ""
                    }`}
                    value={formValues.purchaseOrderNo}
                    readOnly
                    aria-readonly="true"
                  />
                  {errors.purchaseOrderNo ? (
                    <p className={styles.fieldError}>{errors.purchaseOrderNo}</p>
                  ) : null}
                </div>

                <div className={styles.field}>
                  <label htmlFor="poDate">PO date</label>
                  <input
                    id="poDate"
                    name="poDate"
                    type="date"
                    className={`${styles.fieldInput} ${
                      errors.poDate ? styles.fieldInputError : ""
                    }`}
                    value={formValues.poDate}
                    onChange={handleFieldChange}
                    disabled={isSubmitting}
                  />
                  {errors.poDate ? <p className={styles.fieldError}>{errors.poDate}</p> : null}
                </div>
              </div>

              <div className={styles.detailCardsGrid} style={{ marginBottom: "22px" }}>
                <div className={styles.field}>
                  <label htmlFor="poReceivedDate">PO received date</label>
                  <input
                    id="poReceivedDate"
                    name="poReceivedDate"
                    type="date"
                    className={`${styles.fieldInput} ${
                      errors.poReceivedDate ? styles.fieldInputError : ""
                    }`}
                    value={formValues.poReceivedDate}
                    onChange={handleFieldChange}
                    disabled={isSubmitting}
                  />
                  {errors.poReceivedDate ? (
                    <p className={styles.fieldError}>{errors.poReceivedDate}</p>
                  ) : null}
                </div>

                <div className={styles.field}>
                  <label htmlFor="expectedDate">Expected date</label>
                  <input
                    id="expectedDate"
                    name="expectedDate"
                    type="date"
                    className={`${styles.fieldInput} ${
                      errors.expectedDate ? styles.fieldInputError : ""
                    }`}
                    value={formValues.expectedDate}
                    onChange={handleFieldChange}
                    disabled={isSubmitting}
                  />
                  {errors.expectedDate ? (
                    <p className={styles.fieldError}>{errors.expectedDate}</p>
                  ) : null}
                </div>
              </div>

              <div className={styles.field}>
                <label htmlFor="poReference">PO reference upload PDF</label>
                <input
                  ref={fileInputRef}
                  id="poReference"
                  name="poReference"
                  type="file"
                  accept=".pdf,application/pdf"
                  className={`${styles.fieldInput} ${
                    errors.poReference ? styles.fieldInputError : ""
                  }`}
                  onChange={handleFileChange}
                  disabled={isSubmitting}
                />
                {existingReferenceUrl && !poReferenceFile ? (
                  <p className={styles.pageSubtitle} style={{ marginTop: "6px" }}>
                    Current reference file is available.
                  </p>
                ) : null}
                {errors.poReference ? (
                  <p className={styles.fieldError}>{errors.poReference}</p>
                ) : null}
              </div>

              {!isLoadingCatalog && !quotationOptions.length && !editingPurchaseOrderId ? (
                <p className={styles.pageSubtitle} style={{ marginTop: "16px" }}>
                  No client-accepted quotations are available for
                  {" "}
                  {isJobCardMode ? "job card" : "purchase order"}
                  {" "}
                  creation.
                </p>
              ) : null}
            </div>

            <div className={styles.actionRow}>
              <button
                type="submit"
                className={styles.submitBtn}
                disabled={isSubmitting || isLoadingCatalog || !quotationOptions.length}
              >
                {isSubmitting
                  ? editingPurchaseOrderId
                    ? "Updating..."
                    : "Saving..."
                  : editingPurchaseOrderId
                    ? "Update"
                    : "Submit"}
              </button>

              <button
                type="button"
                className={styles.cancelBtn}
                onClick={handleCancel}
                disabled={isSubmitting}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      </main>

      <ToastContainer position="top-right" autoClose={3000} />
    </>
  );
}

export default function PurchaseOrderPage() {
  return (
    <Suspense fallback={null}>
      <PurchaseOrderPageContent />
    </Suspense>
  );
}
