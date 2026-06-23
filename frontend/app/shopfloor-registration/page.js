"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FaThList } from "react-icons/fa";
import { ToastContainer, toast } from "react-toastify";

import "react-toastify/dist/ReactToastify.css";

import { fetchWithAdminAuth } from "@/lib/admin-auth";
import { useAdminPageAccess } from "@/lib/use-admin-page-access";

import baseStyles from "../quotation/quotation.module.css";
import styles from "./shopfloor-registration.module.css";

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

const ACTIVITY_ITEMS = [
  "Inspection",
  "Disassembly",
  "Assessment",
  "QC Check",
];

const MATERIAL_REQUEST_ITEMS = [
  "Internal Request",
  "Service Request",
  "Transport Request",
  "Material Request",
];

const PROCESS_SECTION_CONFIGS = [
  { key: "inspection", title: "Inspection" },
  { key: "assembly", title: "Assembly" },
  { key: "disassembly", title: "Disassembly" },
  { key: "qualityCheck", title: "Quality Check" },
];

const PROCESS_FIELD_CONFIGS = [
  { key: "startDate", label: "Start date", type: "date" },
  { key: "endDate", label: "End date", type: "date" },
  { key: "doneBy", label: "Done by", type: "text" },
  { key: "validateBy", label: "Validate by", type: "text" },
];

const SHOPFLOOR_STORAGE_KEY_PREFIX = "shopfloor-registration";

function buildScopeTableRows(scopeDetails, services, materials) {
  const scopeList = Array.isArray(scopeDetails) ? scopeDetails.filter(Boolean) : [];
  const serviceList = Array.isArray(services) ? services.filter(Boolean) : [];
  const materialList = Array.isArray(materials) ? materials.filter(Boolean) : [];
  const totalRows = Math.max(scopeList.length, serviceList.length, materialList.length, 1);

  return Array.from({ length: totalRows }, (_, index) => ({
    id: index + 1,
    scopeDetail: scopeList[index] || "-",
    service: serviceList[index] || "-",
    material: materialList[index] || "-",
  }));
}

async function requestShopfloorRegistrationOpening(jobCardId) {
  const response = await fetchWithAdminAuth(
    `${API_BASE_URL}/api/operation-register/opening/${jobCardId}/`,
    { cache: "no-store" },
  );
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Failed to load shopfloor registration details.");
  }

  return data;
}

function createEmptyProcessValues() {
  return PROCESS_SECTION_CONFIGS.reduce((accumulator, section) => {
    accumulator[section.key] = {
      startDate: "",
      endDate: "",
      doneBy: "",
      validateBy: "",
    };
    return accumulator;
  }, {});
}

function createEmptySectionLocks() {
  return PROCESS_SECTION_CONFIGS.reduce((accumulator, section) => {
    accumulator[section.key] = false;
    return accumulator;
  }, {});
}

function createEmptyFieldLocks() {
  return PROCESS_SECTION_CONFIGS.reduce((accumulator, section) => {
    accumulator[section.key] = PROCESS_FIELD_CONFIGS.reduce((fieldAccumulator, field) => {
      fieldAccumulator[field.key] = false;
      return fieldAccumulator;
    }, {});
    return accumulator;
  }, {});
}

function normalizeStoredProcessState(storedState) {
  const nextValues = createEmptyProcessValues();
  const nextSectionLocks = createEmptySectionLocks();
  const nextFieldLocks = createEmptyFieldLocks();

  PROCESS_SECTION_CONFIGS.forEach((section) => {
    const storedSectionValues = storedState?.values?.[section.key] || {};
    const storedSectionFieldLocks = storedState?.lockedFields?.[section.key] || {};

    PROCESS_FIELD_CONFIGS.forEach((field) => {
      nextValues[section.key][field.key] = String(storedSectionValues[field.key] || "");
      nextFieldLocks[section.key][field.key] = Boolean(storedSectionFieldLocks[field.key]);
    });

    nextSectionLocks[section.key] = Boolean(storedState?.lockedSections?.[section.key]);
  });

  return {
    values: nextValues,
    lockedSections: nextSectionLocks,
    lockedFields: nextFieldLocks,
  };
}

function getShopfloorStorageKey(jobCardId) {
  return `${SHOPFLOOR_STORAGE_KEY_PREFIX}:${jobCardId}`;
}

function getStoredProcessState(jobCardId) {
  if (typeof window === "undefined" || !jobCardId) {
    return normalizeStoredProcessState(null);
  }

  try {
    const rawValue = window.localStorage.getItem(getShopfloorStorageKey(jobCardId));
    return normalizeStoredProcessState(rawValue ? JSON.parse(rawValue) : null);
  } catch {
    return normalizeStoredProcessState(null);
  }
}

function persistProcessState(jobCardId, values, lockedSections, lockedFields) {
  if (typeof window === "undefined" || !jobCardId) {
    return;
  }

  window.localStorage.setItem(
    getShopfloorStorageKey(jobCardId),
    JSON.stringify({
      values,
      lockedSections,
      lockedFields,
    }),
  );
}

function hasFieldValue(value) {
  return String(value || "").trim() !== "";
}

function isSectionComplete(sectionValues) {
  return PROCESS_FIELD_CONFIGS.every((field) => hasFieldValue(sectionValues?.[field.key]));
}

function hasSectionValue(sectionValues) {
  return PROCESS_FIELD_CONFIGS.some((field) => hasFieldValue(sectionValues?.[field.key]));
}

function getSectionDraftSaved(lockedFieldState) {
  return PROCESS_FIELD_CONFIGS.some((field) => Boolean(lockedFieldState?.[field.key]));
}

function ShopfloorRegistrationPageContent({ jobCardId }) {
  const router = useRouter();
  const { isCheckingAuth, isAuthorized } = useAdminPageAccess(router);
  const initialStoredState = getStoredProcessState(jobCardId);

  const [openingData, setOpeningData] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(() => Boolean(jobCardId));
  const [processValues, setProcessValues] = useState(() => initialStoredState.values);
  const [lockedSections, setLockedSections] = useState(() => initialStoredState.lockedSections);
  const [lockedFields, setLockedFields] = useState(() => initialStoredState.lockedFields);

  useEffect(() => {
    if (!isAuthorized || !jobCardId) {
      return;
    }

    let isMounted = true;

    requestShopfloorRegistrationOpening(jobCardId)
      .then((data) => {
        if (!isMounted) {
          return;
        }

        setOpeningData(data?.opening || null);
        setErrorMessage("");
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        const message = error.message || "Failed to load shopfloor registration details.";
        setOpeningData(null);
        setErrorMessage(message);
        toast.error(message);
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

  if (isCheckingAuth || !isAuthorized || isLoading) {
    return null;
  }

  const scopeTableRows = buildScopeTableRows(
    openingData?.scopeDetails,
    openingData?.services,
    openingData?.materials,
  );

  const persistCurrentProcessState = (nextValues, nextSectionLocks, nextFieldLocks) => {
    setProcessValues(nextValues);
    setLockedSections(nextSectionLocks);
    setLockedFields(nextFieldLocks);
    persistProcessState(jobCardId, nextValues, nextSectionLocks, nextFieldLocks);
  };

  const isProcessFieldLocked = (sectionKey, fieldKey) =>
    Boolean(lockedSections[sectionKey]) || Boolean(lockedFields[sectionKey]?.[fieldKey]);

  const handleProcessFieldChange = (sectionKey, fieldKey, value) => {
    if (isProcessFieldLocked(sectionKey, fieldKey)) {
      return;
    }

    setProcessValues((currentValues) => ({
      ...currentValues,
      [sectionKey]: {
        ...currentValues[sectionKey],
        [fieldKey]: value,
      },
    }));
  };

  const handleSectionSave = (sectionKey) => {
    const sectionConfig = PROCESS_SECTION_CONFIGS.find((item) => item.key === sectionKey);
    const sectionValues = processValues[sectionKey];

    if (!isSectionComplete(sectionValues)) {
      toast.error(`Fill all ${sectionConfig?.title || "section"} fields or use Save Draft.`);
      return;
    }

    const nextSectionLocks = {
      ...lockedSections,
      [sectionKey]: true,
    };
    const nextFieldLocks = {
      ...lockedFields,
      [sectionKey]: {
        ...createEmptyFieldLocks()[sectionKey],
      },
    };

    persistCurrentProcessState(processValues, nextSectionLocks, nextFieldLocks);
    toast.success(`${sectionConfig?.title || "Section"} temporarily saved.`);
  };

  const handleSaveDraft = () => {
    const hasAnyValue = PROCESS_SECTION_CONFIGS.some((section) =>
      hasSectionValue(processValues[section.key]),
    );

    if (!hasAnyValue) {
      toast.error("Enter at least one field before saving draft.");
      return;
    }

    const nextFieldLocks = PROCESS_SECTION_CONFIGS.reduce((accumulator, section) => {
      accumulator[section.key] = PROCESS_FIELD_CONFIGS.reduce((fieldAccumulator, field) => {
        fieldAccumulator[field.key] =
          Boolean(lockedFields[section.key]?.[field.key]) ||
          hasFieldValue(processValues[section.key]?.[field.key]);
        return fieldAccumulator;
      }, {});
      return accumulator;
    }, {});

    persistCurrentProcessState(processValues, lockedSections, nextFieldLocks);
    toast.success("Draft temporarily saved.");
  };

  const handleSaveAll = () => {
    const hasIncompleteSection = PROCESS_SECTION_CONFIGS.some(
      (section) => !isSectionComplete(processValues[section.key]),
    );

    if (hasIncompleteSection) {
      toast.error("Fill all activity cards before saving. Use Save Draft for partial data.");
      return;
    }

    const nextSectionLocks = PROCESS_SECTION_CONFIGS.reduce((accumulator, section) => {
      accumulator[section.key] = true;
      return accumulator;
    }, {});
    const nextFieldLocks = createEmptyFieldLocks();

    persistCurrentProcessState(processValues, nextSectionLocks, nextFieldLocks);
    toast.success("Shopfloor registration saved successfully.");
  };

  return (
    <>
      <main className={baseStyles.contentArea}>
        <section className={baseStyles.card}>
          <div className={baseStyles.topRightWrapper}>
            <div>
              <h1 className={baseStyles.pageTitle}>Shopfloor Registration</h1>
            </div>
            <div className={baseStyles.headerActions}>
              <button
                type="button"
                className={baseStyles.topIconButton}
                onClick={() => router.push("/work-queue")}
                title="Open work queue"
                aria-label="Open work queue"
              >
                <FaThList />
              </button>
            </div>
          </div>

          {errorMessage ? <div style={ERROR_BANNER_STYLE}>{errorMessage}</div> : null}

          {!jobCardId || !openingData ? (
            <div className={baseStyles.invoiceIntroCard}>
              <div className={baseStyles.sectionTitleRow}>
                <h2 className={baseStyles.sectionTitle}>Shopfloor Registration Details</h2>
              </div>
            </div>
          ) : (
            <div className={styles.pageStack}>
              <section className={baseStyles.detailCard}>
                <h2 className={baseStyles.detailCardTitle}>RFQ Details</h2>
                <div className={baseStyles.detailCardsGrid} style={{ marginBottom: 0 }}>
                  <div className={baseStyles.field}>
                    <label htmlFor="rfqNo">RFQ no</label>
                    <input
                      id="rfqNo"
                      className={`${baseStyles.fieldInput} ${baseStyles.readOnlyInput}`}
                      value={openingData.rfqNo || ""}
                      readOnly
                      aria-readonly="true"
                    />
                  </div>

                  <div className={baseStyles.field}>
                    <label htmlFor="rfqDate">RFQ date</label>
                    <input
                      id="rfqDate"
                      className={`${baseStyles.fieldInput} ${baseStyles.readOnlyInput}`}
                      value={openingData.rfqDate || ""}
                      readOnly
                      aria-readonly="true"
                    />
                  </div>
                </div>
              </section>

              <section className={baseStyles.detailCard}>
                <h2 className={baseStyles.detailCardTitle}>Client Details</h2>
                <div className={baseStyles.detailCardsGrid} style={{ marginBottom: 0 }}>
                  <div className={baseStyles.field}>
                    <label htmlFor="attentionName">Attention name</label>
                    <input
                      id="attentionName"
                      className={`${baseStyles.fieldInput} ${baseStyles.readOnlyInput}`}
                      value={openingData.attentionName || ""}
                      readOnly
                      aria-readonly="true"
                    />
                  </div>

                  <div className={baseStyles.field}>
                    <label htmlFor="companyName">Company name</label>
                    <input
                      id="companyName"
                      className={`${baseStyles.fieldInput} ${baseStyles.readOnlyInput}`}
                      value={openingData.companyName || ""}
                      readOnly
                      aria-readonly="true"
                    />
                  </div>
                </div>
              </section>

              <section className={baseStyles.detailCard}>
                <h2 className={baseStyles.detailCardTitle}>Purchase Order Details</h2>
                <div className={baseStyles.detailCardsGrid} style={{ marginBottom: 0 }}>
                  <div className={baseStyles.field}>
                    <label htmlFor="purchaseOrderNo">PO no</label>
                    <input
                      id="purchaseOrderNo"
                      className={`${baseStyles.fieldInput} ${baseStyles.readOnlyInput}`}
                      value={openingData.purchaseOrderNo || ""}
                      readOnly
                      aria-readonly="true"
                    />
                  </div>

                  <div className={baseStyles.field}>
                    <label htmlFor="poDate">PO date</label>
                    <input
                      id="poDate"
                      className={`${baseStyles.fieldInput} ${baseStyles.readOnlyInput}`}
                      value={openingData.poDate || ""}
                      readOnly
                      aria-readonly="true"
                    />
                  </div>
                </div>
              </section>

              <section className={baseStyles.detailCard}>
                <h2 className={baseStyles.detailCardTitle}>Quotation Details</h2>
                <div className={baseStyles.detailCardsGrid} style={{ marginBottom: 0 }}>
                  <div className={baseStyles.field}>
                    <label htmlFor="quotationDate">Quotation date</label>
                    <input
                      id="quotationDate"
                      className={`${baseStyles.fieldInput} ${baseStyles.readOnlyInput}`}
                      value={openingData.quotationDate || ""}
                      readOnly
                      aria-readonly="true"
                    />
                  </div>

                  <div className={baseStyles.field}>
                    <label htmlFor="quotationCode">Quotation no</label>
                    <input
                      id="quotationCode"
                      className={`${baseStyles.fieldInput} ${baseStyles.readOnlyInput}`}
                      value={openingData.quotationCode || ""}
                      readOnly
                      aria-readonly="true"
                    />
                  </div>
                </div>
              </section>

              <section className={baseStyles.detailCard}>
                <h2 className={baseStyles.detailCardTitle}>Scope Details</h2>
                <div className={baseStyles.tableResponsive} style={{ marginBottom: 0 }}>
                  <table className={baseStyles.itemsTable}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Scope</th>
                        <th>Services</th>
                        <th>Raw materials</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scopeTableRows.map((row) => (
                        <tr key={row.id}>
                          <td>{row.id}</td>
                          <td>{row.scopeDetail}</td>
                          <td>{row.service}</td>
                          <td>{row.material}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className={baseStyles.detailCard}>
                <h2 className={baseStyles.detailCardTitle}>Activity Details</h2>
                <div className={styles.compactCardGrid}>
                  {ACTIVITY_ITEMS.map((item) => (
                    <div key={item} className={styles.compactCard}>
                      {item}
                    </div>
                  ))}
                </div>
              </section>

              <section className={baseStyles.detailCard}>
                <h2 className={baseStyles.detailCardTitle}>Request For Material</h2>
                <div className={styles.compactCardGrid}>
                  {MATERIAL_REQUEST_ITEMS.map((item) => (
                    <div key={item} className={styles.compactCard}>
                      {item}
                    </div>
                  ))}
                </div>
              </section>

              {PROCESS_SECTION_CONFIGS.map((section) => {
                const isSectionSaved = Boolean(lockedSections[section.key]);
                const isDraftSaved = getSectionDraftSaved(lockedFields[section.key]);

                return (
                  <section key={section.key} className={baseStyles.detailCard}>
                    <div className={styles.cardHeaderRow}>
                      <h2 className={`${baseStyles.detailCardTitle} ${styles.cardTitle}`}>
                        {section.title}
                      </h2>
                      <div className={styles.cardHeaderActions}>
                        {isSectionSaved || isDraftSaved ? (
                          <span className={styles.savedStatus}>Temporary saved</span>
                        ) : null}
                        <button
                          type="button"
                          className={styles.sectionSaveButton}
                          onClick={() => handleSectionSave(section.key)}
                          disabled={isSectionSaved}
                        >
                          {isSectionSaved ? "Saved" : "Save"}
                        </button>
                      </div>
                    </div>

                    <div className={styles.processFieldGrid}>
                      {PROCESS_FIELD_CONFIGS.map((field) => {
                        const isLocked = isProcessFieldLocked(section.key, field.key);

                        return (
                          <div key={field.key} className={baseStyles.field}>
                            <label htmlFor={`${section.key}-${field.key}`}>{field.label}</label>
                            <input
                              id={`${section.key}-${field.key}`}
                              type={field.type}
                              className={`${baseStyles.fieldInput} ${
                                isLocked ? baseStyles.readOnlyInput : ""
                              }`}
                              value={processValues[section.key]?.[field.key] || ""}
                              readOnly={isLocked}
                              aria-readonly={isLocked ? "true" : undefined}
                              onChange={(event) =>
                                handleProcessFieldChange(
                                  section.key,
                                  field.key,
                                  event.target.value,
                                )
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}

              <div className={baseStyles.actionRow}>
                <button
                  type="button"
                  className={baseStyles.cancelBtn}
                  onClick={handleSaveDraft}
                >
                  Save Draft
                </button>
                <button
                  type="button"
                  className={baseStyles.submitBtn}
                  onClick={handleSaveAll}
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </section>
      </main>

      <ToastContainer position="top-right" autoClose={3000} />
    </>
  );
}

function ShopfloorRegistrationPageShell() {
  const searchParams = useSearchParams();
  const jobCardId = searchParams.get("jobCardId");

  return (
    <ShopfloorRegistrationPageContent
      key={jobCardId || "shopfloor-registration"}
      jobCardId={jobCardId}
    />
  );
}

export default function ShopfloorRegistrationPage() {
  return (
    <Suspense fallback={null}>
      <ShopfloorRegistrationPageShell />
    </Suspense>
  );
}
