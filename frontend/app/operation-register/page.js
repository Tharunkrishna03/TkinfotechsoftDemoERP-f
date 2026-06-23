"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FaThList } from "react-icons/fa";
import { ToastContainer, toast } from "react-toastify";

import "react-toastify/dist/ReactToastify.css";

import { fetchWithAdminAuth, getStoredAdminAuth } from "@/lib/admin-auth";
import { ADMIN_ROLE, HOD_ROLE, getUserRoles } from "@/lib/admin-access";
import { useAdminPageAccess } from "@/lib/use-admin-page-access";
import { getApiErrorMessage, getTodayValue } from "../quotation/shared";

import styles from "../quotation/quotation.module.css";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

const SHOP_FLOOR_OPTIONS = [
  { value: "supervisor_1", label: "Supervisor 1" },
  { value: "supervisor_2", label: "Supervisor 2" },
  { value: "supervisor_3", label: "Supervisor 3" },
];

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
  return {
    operationNo: "",
    opDate: getTodayValue(),
    shopFloorIncharge: "",
    remarks: "",
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

async function requestOperationRegisterOpening(jobCardId) {
  const response = await fetchWithAdminAuth(
    `${API_BASE_URL}/api/operation-register/opening/${jobCardId}/`,
    { cache: "no-store" },
  );
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, "Failed to load operation register details."));
  }

  return data;
}

async function saveOperationRegister(payload) {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/operation-register/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(getApiErrorMessage(data, "Failed to save operation register."));
    error.data = data;
    throw error;
  }

  return data;
}

async function updateOperationRegister(id, payload) {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/operation-register/${id}/`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(getApiErrorMessage(data, "Failed to update operation register."));
    error.data = data;
    throw error;
  }

  return data;
}

function OperationRegisterPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isCheckingAuth, isAuthorized } = useAdminPageAccess(router);
  const jobCardId = searchParams.get("jobCardId");

  const [openingData, setOpeningData] = useState(null);
  const [operationRegisterId, setOperationRegisterId] = useState(null);
  const [formValues, setFormValues] = useState(() => createInitialFormValues());
  const [errors, setErrors] = useState({});
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const listPath = canEdit ? "/operation-register-list" : "/work-queue";

  useEffect(() => {
    const currentUser = getStoredAdminAuth()?.user || null;
    const nextCanEdit = getUserRoles(currentUser).some(
      (role) => role === ADMIN_ROLE || role === HOD_ROLE,
    );
    setCanEdit(nextCanEdit);
  }, []);

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    if (!jobCardId) {
      setOpeningData(null);
      setOperationRegisterId(null);
      setFormValues(createInitialFormValues());
      setErrors({});
      setErrorMessage("");
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    requestOperationRegisterOpening(jobCardId)
      .then((data) => {
        if (!isMounted) {
          return;
        }

        const opening = data?.opening || {};
        const existingOperationRegister = data?.operationRegister || null;

        setOpeningData(opening);
        setOperationRegisterId(
          existingOperationRegister?.id || opening.operationRegisterId || null,
        );
        setFormValues(
          createInitialFormValues({
            operationNo: opening.operationNo || "",
            opDate: opening.opDate || getTodayValue(),
            shopFloorIncharge: opening.shopFloorIncharge || "",
            remarks: opening.remarks || "",
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
        setOperationRegisterId(null);
        setErrorMessage(error.message || "Failed to load operation register details.");
        toast.error(error.message || "Failed to load operation register details.");
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isAuthorized, jobCardId]);

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

    if (!jobCardId) {
      nextErrors.jobCardId = "Open a job card from the HOD list.";
    }

    if (!formValues.operationNo) {
      nextErrors.operationNo = "Operation number is required.";
    }

    if (!formValues.opDate) {
      nextErrors.opDate = "Operation date is required.";
    }

    if (!formValues.shopFloorIncharge) {
      nextErrors.shopFloorIncharge = "Select the shop floor incharge.";
    }

    setErrors(nextErrors);
    return !Object.keys(nextErrors).length;
  };

  const handleCancel = () => {
    router.push(listPath);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!canEdit) {
      return;
    }

    if (!validateForm()) {
      toast.error("Please fix the operation register details.");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        jobCardId,
        shopFloorIncharge: formValues.shopFloorIncharge,
        remarks: formValues.remarks,
      };

      const response = operationRegisterId
        ? await updateOperationRegister(operationRegisterId, payload)
        : await saveOperationRegister(payload);

      toast.success(response.message || "Operation register saved successfully.");
      router.push(
        `/operation-register-list?operationSaved=${operationRegisterId ? "updated" : "created"}`,
      );
    } catch (error) {
      const nextErrors = mapServerErrors(error.data);
      setErrors(nextErrors);
      setErrorMessage(error.message || "Failed to save operation register.");
      toast.error(error.message || "Failed to save operation register.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isCheckingAuth || !isAuthorized || isLoading) {
    return null;
  }

  return (
    <>
      <main className={styles.contentArea}>
        <section className={styles.card}>
          <div className={styles.topRightWrapper}>
            <div>
              <h1 className={styles.pageTitle}>Operation Register</h1>
            </div>
            <div className={styles.headerActions}>
              <button
                type="button"
                className={styles.topIconButton}
                onClick={() => router.push(listPath)}
                title={canEdit ? "Open operation register list" : "Open work queue"}
                aria-label={canEdit ? "Open operation register list" : "Open work queue"}
              >
                <FaThList />
              </button>
            </div>
          </div>

          {errorMessage ? <div style={ERROR_BANNER_STYLE}>{errorMessage}</div> : null}

          {!jobCardId || !openingData ? (
            <div className={styles.invoiceIntroCard}>
              <div className={styles.sectionTitleRow}>
                <h2 className={styles.sectionTitle}>Operation Register Details</h2>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <section className={styles.detailCard}>
                <h2 className={styles.detailCardTitle}>Operation Details</h2>
                <div className={styles.detailCardsGrid} style={{ marginBottom: 0 }}>
                  <div className={styles.field}>
                    <label htmlFor="operationNo">Operation no</label>
                    <input
                      id="operationNo"
                      className={`${styles.fieldInput} ${styles.autoGeneratedInput}`}
                      value={formValues.operationNo}
                      readOnly
                      aria-readonly="true"
                    />
                    {errors.operationNo ? (
                      <p className={styles.fieldError}>{errors.operationNo}</p>
                    ) : null}
                  </div>

                  <div className={styles.field}>
                    <label htmlFor="opDate">Op date</label>
                    <input
                      id="opDate"
                      className={`${styles.fieldInput} ${styles.readOnlyInput}`}
                      value={formValues.opDate}
                      readOnly
                      aria-readonly="true"
                    />
                    {errors.opDate ? <p className={styles.fieldError}>{errors.opDate}</p> : null}
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
                    <label htmlFor="rfqDate">RFQ date</label>
                    <input
                      id="rfqDate"
                      className={`${styles.fieldInput} ${styles.readOnlyInput}`}
                      value={openingData.rfqDate || ""}
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
                    <label htmlFor="attentionName">Attention name</label>
                    <input
                      id="attentionName"
                      className={`${styles.fieldInput} ${styles.readOnlyInput}`}
                      value={openingData.attentionName || ""}
                      readOnly
                      aria-readonly="true"
                    />
                  </div>

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
                </div>
              </section>

              <section className={styles.detailCard}>
                <h2 className={styles.detailCardTitle}>Purchase Order Details</h2>
                <div className={styles.detailCardsGrid} style={{ marginBottom: 0 }}>
                  <div className={styles.field}>
                    <label htmlFor="purchaseOrderNo">PO no</label>
                    <input
                      id="purchaseOrderNo"
                      className={`${styles.fieldInput} ${styles.readOnlyInput}`}
                      value={openingData.purchaseOrderNo || ""}
                      readOnly
                      aria-readonly="true"
                    />
                  </div>

                  <div className={styles.field}>
                    <label htmlFor="poDate">PO date</label>
                    <input
                      id="poDate"
                      className={`${styles.fieldInput} ${styles.readOnlyInput}`}
                      value={openingData.poDate || ""}
                      readOnly
                      aria-readonly="true"
                    />
                  </div>
                </div>
              </section>

              <section className={styles.detailCard}>
                <h2 className={styles.detailCardTitle}>Planning Details</h2>
                <div className={styles.detailCardsGrid} style={{ marginBottom: 0 }}>
                  <div className={styles.field}>
                    <label htmlFor="planStartDate">Planning start date</label>
                    <input
                      id="planStartDate"
                      className={`${styles.fieldInput} ${styles.readOnlyInput}`}
                      value={openingData.planStartDate || ""}
                      readOnly
                      aria-readonly="true"
                    />
                  </div>

                  <div className={styles.field}>
                    <label htmlFor="planEndDate">Plan end date</label>
                    <input
                      id="planEndDate"
                      className={`${styles.fieldInput} ${styles.readOnlyInput}`}
                      value={openingData.planEndDate || ""}
                      readOnly
                      aria-readonly="true"
                    />
                  </div>
                </div>
              </section>

              <section className={styles.detailCard}>
                <h2 className={styles.detailCardTitle}>Shop</h2>
                <div className={styles.detailCardsGrid} style={{ marginBottom: 0 }}>
                  <div className={styles.field}>
                    <label htmlFor="shopFloorIncharge">Shop floor incharge</label>
                    <select
                      id="shopFloorIncharge"
                      name="shopFloorIncharge"
                      className={`${styles.fieldInput} ${
                        errors.shopFloorIncharge ? styles.fieldInputError : ""
                      }`}
                      value={formValues.shopFloorIncharge}
                      onChange={handleFieldChange}
                      disabled={!canEdit || isSubmitting}
                    >
                      <option value="">Select supervisor</option>
                      {SHOP_FLOOR_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {errors.shopFloorIncharge ? (
                      <p className={styles.fieldError}>{errors.shopFloorIncharge}</p>
                    ) : null}
                  </div>

                  <div className={styles.field}>
                    <label htmlFor="remarks">Remarks</label>
                    <textarea
                      id="remarks"
                      name="remarks"
                      rows={4}
                      className={styles.fieldInput}
                      value={formValues.remarks}
                      onChange={handleFieldChange}
                      disabled={!canEdit || isSubmitting}
                    />
                  </div>
                </div>
              </section>

              <div className={styles.actionRow}>
                {canEdit ? (
                  <button type="submit" className={styles.submitBtn} disabled={isSubmitting}>
                    {isSubmitting ? "Saving..." : "Submit"}
                  </button>
                ) : null}
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

export default function OperationRegisterPage() {
  return (
    <Suspense fallback={null}>
      <OperationRegisterPageContent />
    </Suspense>
  );
}
