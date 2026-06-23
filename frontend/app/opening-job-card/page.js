"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FaThList } from "react-icons/fa";
import { ToastContainer, toast } from "react-toastify";

import { fetchWithAdminAuth } from "@/lib/admin-auth";
import { useAdminPageAccess } from "@/lib/use-admin-page-access";
import {
  getApiErrorMessage,
  getQuotationCodeDisplay,
  getTodayValue,
} from "../quotation/shared";

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
    jobCardNo: "",
    jobCardDate: today,
    planningDate: today,
    expectedDate: "",
    remarks: "",
    deliveryRemark: "",
    ...overrides,
  };
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

function buildScopeTableRows(scopeDetails, materials, services) {
  const scopeList = Array.isArray(scopeDetails) ? scopeDetails.filter(Boolean) : [];
  const materialList = Array.isArray(materials) ? materials.filter(Boolean) : [];
  const serviceList = Array.isArray(services) ? services.filter(Boolean) : [];
  const totalRows = Math.max(scopeList.length, materialList.length, serviceList.length, 1);

  return Array.from({ length: totalRows }, (_, index) => ({
    id: index + 1,
    scopeDetail: scopeList[index] || "-",
    material: materialList[index] || "-",
    service: serviceList[index] || "-",
  }));
}

async function requestJobCardOpening({ purchaseOrderId, quotationId }) {
  const endpoint = purchaseOrderId
    ? `/api/job-card/opening/${purchaseOrderId}/`
    : `/api/job-card/opening/quotation/${quotationId}/`;
  const response = await fetchWithAdminAuth(
    `${API_BASE_URL}${endpoint}`,
    {
      cache: "no-store",
    },
  );
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, "Failed to load job card details."));
  }

  return data;
}

async function saveJobCard(payload) {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/job-card/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(getApiErrorMessage(data, "Failed to save job card."));
    error.data = data;
    throw error;
  }

  return data;
}

async function updateJobCard(id, payload) {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/job-card/${id}/`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(getApiErrorMessage(data, "Failed to update job card."));
    error.data = data;
    throw error;
  }

  return data;
}

function OpeningJobCardPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isCheckingAuth, isAuthorized } = useAdminPageAccess(router);
  const purchaseOrderId = searchParams.get("purchaseOrderId");
  const quotationId = searchParams.get("quotationId");

  const [openingData, setOpeningData] = useState(null);
  const [jobCardId, setJobCardId] = useState(null);
  const [formValues, setFormValues] = useState(() => createInitialFormValues());
  const [errors, setErrors] = useState({});
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    if (!purchaseOrderId && !quotationId) {
      setOpeningData(null);
      setJobCardId(null);
      setFormValues(createInitialFormValues());
      setErrors({});
      setErrorMessage("");
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    requestJobCardOpening({ purchaseOrderId, quotationId })
      .then((data) => {
        if (!isMounted) {
          return;
        }

        const opening = data?.opening || {};
        const existingJobCard = data?.jobCard || null;

        setOpeningData(opening);
        setJobCardId(existingJobCard?.id || opening.jobCardId || null);
        setFormValues(
          createInitialFormValues({
            jobCardNo: opening.jobCardNo || "",
            jobCardDate: opening.jobCardDate || getTodayValue(),
            planningDate: opening.planningDate || getTodayValue(),
            expectedDate: opening.expectedDate || "",
            remarks: opening.remarks || "",
            deliveryRemark: opening.deliveryRemark || "",
          }),
        );
        setErrors({});
        setErrorMessage("");
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        setOpeningData(null);
        setJobCardId(null);
        setErrorMessage(error.message || "Failed to load job card details.");
        toast.error(error.message || "Failed to load job card details.");
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isAuthorized, purchaseOrderId, quotationId]);

  const handleFieldChange = (event) => {
    const { name, value } = event.target;

    setFormValues((currentValues) => ({
      ...currentValues,
      [name]: value,
    }));
    setErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };
      delete nextErrors[name];
      return nextErrors;
    });
    setErrorMessage("");
  };

  const validateForm = () => {
    const nextErrors = {};

    if (!purchaseOrderId && !quotationId) {
      nextErrors.purchaseOrderId = "Open a queue item from the job card queue.";
    }

    if (!formValues.jobCardNo) {
      nextErrors.jobCardNo = "Job card number is required.";
    }

    if (!formValues.jobCardDate) {
      nextErrors.jobCardDate = "Job card date is required.";
    }

    if (!formValues.planningDate) {
      nextErrors.planningDate = "Planning date is required.";
    }

    if (!formValues.expectedDate) {
      nextErrors.expectedDate = "Expected date is required.";
    } else if (
      formValues.planningDate &&
      formValues.expectedDate < formValues.planningDate
    ) {
      nextErrors.expectedDate = "Expected date cannot be before the planning date.";
    }

    setErrors(nextErrors);
    return !Object.keys(nextErrors).length;
  };

  const handleCancel = () => {
    router.push("/job-card-queue");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!validateForm()) {
      toast.error("Please fix the job card details.");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        jobCardDate: formValues.jobCardDate,
        planningDate: formValues.planningDate,
        expectedDate: formValues.expectedDate,
        remarks: formValues.remarks,
        deliveryRemark: formValues.deliveryRemark,
      };
      if (purchaseOrderId) {
        payload.purchaseOrderId = purchaseOrderId;
      }
      if (quotationId) {
        payload.quotationId = quotationId;
      }

      const response = jobCardId
        ? await updateJobCard(jobCardId, payload)
        : await saveJobCard(payload);

      toast.success(response.message || "Job card saved successfully");
      router.push(`/job-card-list?jobCardSaved=${jobCardId ? "updated" : "created"}`);
    } catch (error) {
      const nextErrors = mapServerErrors(error.data);
      setErrors(nextErrors);
      setErrorMessage(error.message || "Failed to save job card.");
      toast.error(error.message || "Failed to save job card.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isCheckingAuth || !isAuthorized || isLoading) {
    return null;
  }

  const isDirectSource = openingData?.sourceType === "quotation";
  const scopeTableRows = buildScopeTableRows(
    openingData?.scopeDetails,
    openingData?.materials,
    openingData?.services,
  );

  return (
    <>
      <main className={styles.contentArea}>
        <section className={styles.card}>
          <div className={styles.topRightWrapper}>
            <div>
              <h1 className={styles.pageTitle}>Create Job Card</h1>
             
            </div>
            <div className={styles.headerActions}>
              <button
                type="button"
                className={styles.topIconButton}
                onClick={() => router.push("/job-card-list")}
                title="Open job card list"
                aria-label="Open job card list"
              >
                <FaThList />
              </button>
            </div>
          </div>

          {errorMessage ? <div style={ERROR_BANNER_STYLE}>{errorMessage}</div> : null}

          {((!purchaseOrderId && !quotationId) || !openingData) ? (
            <div className={styles.invoiceIntroCard}>
              <div className={styles.sectionTitleRow}>
                <h2 className={styles.sectionTitle}>Job Card Details</h2>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div>
                <section className={styles.detailCard}>
                  <h2 className={styles.detailCardTitle}>Job Card Details</h2>
                  <div className={styles.detailCardsGrid} style={{ marginBottom: 0 }}>
                    <div className={styles.field}>
                      <label htmlFor="jobCardNo">Job card no</label>
                      <input
                        id="jobCardNo"
                        className={`${styles.fieldInput} ${styles.autoGeneratedInput}`}
                        value={formValues.jobCardNo}
                        readOnly
                        aria-readonly="true"
                      />
                      {errors.jobCardNo ? (
                        <p className={styles.fieldError}>{errors.jobCardNo}</p>
                      ) : null}
                    </div>

                    <div className={styles.field}>
                      <label htmlFor="jobCardDate">Job card date</label>
                      <input
                        id="jobCardDate"
                        name="jobCardDate"
                        type="date"
                        className={`${styles.fieldInput} ${
                          errors.jobCardDate ? styles.fieldInputError : ""
                        }`}
                        value={formValues.jobCardDate}
                        onChange={handleFieldChange}
                        disabled={isSubmitting}
                      />
                      {errors.jobCardDate ? (
                        <p className={styles.fieldError}>{errors.jobCardDate}</p>
                      ) : null}
                    </div>
                  </div>
                </section>

                <section className={styles.detailCard}>
                  <h2 className={styles.detailCardTitle}>RFQ Details</h2>
                  <div className={styles.detailCardsGrid} style={{ marginBottom: 0 }}>
                    <div className={styles.field}>
                      <label htmlFor="rfqNo">RFQ no</label>
                      <input
                        id="rfqNo"
                        className={`${styles.fieldInput} ${styles.readOnlyInput}`}
                        value={openingData.rfqNo || ""}
                        readOnly
                        aria-readonly="true"
                      />
                    </div>

                    <div className={styles.field}>
                      <label htmlFor="rfqType">RFQ type</label>
                      <input
                        id="rfqType"
                        className={`${styles.fieldInput} ${styles.readOnlyInput}`}
                        value={openingData.rfqTypeLabel || ""}
                        readOnly
                        aria-readonly="true"
                      />
                    </div>

                    <div className={styles.field}>
                      <label htmlFor="rfqCategory">RFQ category</label>
                      <input
                        id="rfqCategory"
                        className={`${styles.fieldInput} ${styles.readOnlyInput}`}
                        value={openingData.rfqCategoryLabel || ""}
                        readOnly
                        aria-readonly="true"
                      />
                    </div>

                    <div className={styles.field}>
                      <label htmlFor="quotationCode">Quotation no</label>
                      <input
                        id="quotationCode"
                        className={`${styles.fieldInput} ${styles.readOnlyInput}`}
                        value={getQuotationCodeDisplay(openingData)}
                        readOnly
                        aria-readonly="true"
                      />
                    </div>
                  </div>
                </section>

                <section className={styles.detailCard}>
                  <h2 className={styles.detailCardTitle}>Client Details</h2>
                  <div className={styles.detailCardsGrid} style={{ marginBottom: 0 }}>
                    <div className={styles.field}>
                      <label htmlFor="companyName">Company name</label>
                      <input
                        id="companyName"
                        className={`${styles.fieldInput} ${styles.readOnlyInput}`}
                        value={openingData.companyName || ""}
                        readOnly
                        aria-readonly="true"
                      />
                    </div>

                    <div className={styles.field}>
                      <label htmlFor="attentionName">Attention name</label>
                      <input
                        id="attentionName"
                        className={`${styles.fieldInput} ${styles.readOnlyInput}`}
                        value={openingData.attentionName || ""}
                        readOnly
                        aria-readonly="true"
                      />
                    </div>
                  </div>
                </section>

                <section className={styles.detailCard}>
                  <h2 className={styles.detailCardTitle}>Scope Details</h2>
                  <div className={styles.tableResponsive} style={{ marginBottom: "16px" }}>
                    <table className={styles.itemsTable}>
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Scope details</th>
                          <th>Material</th>
                          <th>Services</th>
                        </tr>
                      </thead>
                      <tbody>
                        {scopeTableRows.map((row) => (
                          <tr key={row.id}>
                            <td>{row.id}</td>
                            <td>{row.scopeDetail}</td>
                            <td>{row.material}</td>
                            <td>{row.service}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className={styles.field}>
                    <label htmlFor="remarks">Remarks</label>
                    <textarea
                      id="remarks"
                      name="remarks"
                      rows={5}
                      className={styles.fieldInput}
                      value={formValues.remarks}
                      onChange={handleFieldChange}
                      disabled={isSubmitting}
                    />
                  </div>
                </section>

                <div className={styles.detailCardsGrid}>
                  <section className={styles.detailCard} style={{ marginBottom: 0 }}>
                    <h2 className={styles.detailCardTitle}>
                      {isDirectSource ? "Workflow Source" : "Purchase Order No"}
                    </h2>
                    <div className={styles.field}>
                      <label htmlFor="purchaseOrderNo">
                        {isDirectSource ? "Source" : "PO no"}
                      </label>
                      <input
                        id="purchaseOrderNo"
                        className={`${styles.fieldInput} ${styles.readOnlyInput}`}
                        value={isDirectSource ? "Direct RFQ" : openingData.purchaseOrderNo || ""}
                        readOnly
                        aria-readonly="true"
                      />
                    </div>
                  </section>

                  <section className={styles.detailCard} style={{ marginBottom: 0 }}>
                    <h2 className={styles.detailCardTitle}>
                      {isDirectSource ? "Source Reference" : "Purchase Order Date"}
                    </h2>
                    <div className={styles.field}>
                      <label htmlFor="poDate">
                        {isDirectSource ? "Quotation no" : "PO date"}
                      </label>
                      <input
                        id="poDate"
                        className={`${styles.fieldInput} ${styles.readOnlyInput}`}
                        value={
                          isDirectSource
                            ? getQuotationCodeDisplay(openingData)
                            : openingData.poDate || ""
                        }
                        readOnly
                        aria-readonly="true"
                      />
                    </div>
                  </section>
                </div>

                <section className={styles.detailCard}>
                  <h2 className={styles.detailCardTitle}>Delivery Details</h2>
                  <div className={styles.detailCardsGrid} style={{ marginBottom: 0 }}>
                    <div className={styles.field}>
                      <label htmlFor="planningDate">Planning date</label>
                      <input
                        id="planningDate"
                        name="planningDate"
                        type="date"
                        className={`${styles.fieldInput} ${
                          errors.planningDate ? styles.fieldInputError : ""
                        }`}
                        value={formValues.planningDate}
                        onChange={handleFieldChange}
                        disabled={isSubmitting}
                      />
                      {errors.planningDate ? (
                        <p className={styles.fieldError}>{errors.planningDate}</p>
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

                    <div className={styles.field} style={{ gridColumn: "1 / -1" }}>
                      <label htmlFor="deliveryRemark">Remark</label>
                      <textarea
                        id="deliveryRemark"
                        name="deliveryRemark"
                        rows={4}
                        className={styles.fieldInput}
                        value={formValues.deliveryRemark}
                        onChange={handleFieldChange}
                        disabled={isSubmitting}
                      />
                    </div>
                  </div>
                </section>
              </div>

              <div className={styles.actionRow}>
                <button
                  type="submit"
                  className={styles.submitBtn}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Saving..." : jobCardId ? "Update" : "Submit"}
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
          )}
        </section>
      </main>

      <ToastContainer position="top-right" autoClose={3000} />
    </>
  );
}

export default function OpeningJobCardPage() {
  return (
    <Suspense fallback={null}>
      <OpeningJobCardPageContent />
    </Suspense>
  );
}
