"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ToastContainer } from "react-toastify";

import "react-toastify/dist/ReactToastify.css";

import {
  clearStoredAdminAuth,
  fetchWithAdminAuth,
  getStoredAdminAuth,
  verifyAdminAccess,
} from "@/lib/admin-auth";

import styles from "./cost-estimation-sheet-view.module.css";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

const SECTION_CONFIGS = [
  { key: "raw_material", title: "Raw Material", totalField: "rawMaterialTotal" },
  { key: "manufacturing", title: "Manufacturing Process", totalField: "processTotal" },
  { key: "labor", title: "Manpower", totalField: "laborTotal" },
  { key: "packaging", title: "Transport", totalField: "packagingTotal" },
  { key: "overhead", title: "Overhead Cost", totalField: "overheadTotal", mode: "single_amount" },
  {
    key: "miscellaneous",
    title: "Miscellaneous",
    totalField: "miscellaneousTotal",
    mode: "single_amount",
  },
];

function parseNumericValue(value) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function formatAmount(value) {
  return parseNumericValue(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCurrencyAmount(value) {
  return `\u20b9${formatAmount(value)}`;
}

function getSectionTotal(sheet, section) {
  const rows = Array.isArray(sheet?.rows)
    ? sheet.rows.filter((row) => row.section === section.key)
    : [];

  if (rows.length) {
    return rows.reduce((total, row) => total + parseNumericValue(row.total), 0);
  }

  return parseNumericValue(sheet?.[section.totalField]);
}

function getSheetDisplayMetrics(sheet) {
  if (!sheet) {
    return null;
  }

  const sectionTotals = SECTION_CONFIGS.reduce((accumulator, section) => {
    accumulator[section.key] = getSectionTotal(sheet, section);
    return accumulator;
  }, {});
  const subtotal = SECTION_CONFIGS.reduce(
    (total, section) => total + parseNumericValue(sectionTotals[section.key]),
    0,
  );
  const taxAmount = subtotal * (parseNumericValue(sheet.taxPercentage) / 100);
  const profitMarginAmount = subtotal * (parseNumericValue(sheet.profitMarginPercentage) / 100);
  const finalBatteryCost = subtotal + taxAmount + profitMarginAmount;
  const derivedQuantity =
    parseNumericValue(sheet.costPerUnit) > 0
      ? parseNumericValue(sheet.finalBatteryCost) / parseNumericValue(sheet.costPerUnit)
      : 0;
  const costPerUnit =
    derivedQuantity > 0 ? finalBatteryCost / derivedQuantity : parseNumericValue(sheet.costPerUnit);

  return {
    sectionTotals,
    subtotal,
    taxAmount,
    profitMarginAmount,
    finalBatteryCost,
    costPerUnit,
  };
}

async function requestCostEstimationSheets() {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/cost-estimation/sheets/`, {
    cache: "no-store",
  });
  const data = await response.json().catch(() => []);

  if (!response.ok) {
    throw new Error("Failed to load cost estimation sheets.");
  }

  return Array.isArray(data) ? data : [];
}

async function requestCostEstimationSheetDetail(id) {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/cost-estimation/sheets/${id}/`, {
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Failed to load cost estimation sheet.");
  }

  return data;
}

export default function CostEstimationSheetViewPageClient({
  selectedSheetQueryId = "",
}) {
  const router = useRouter();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [sheets, setSheets] = useState([]);
  const [selectedSheetId, setSelectedSheetId] = useState("");

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

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    let isMounted = true;

    const loader = selectedSheetQueryId
      ? requestCostEstimationSheetDetail(selectedSheetQueryId).then((data) => [data])
      : requestCostEstimationSheets();

    loader
      .then((data) => {
        if (!isMounted) {
          return;
        }

        setErrorMessage("");
        setSheets(data);
        setSelectedSheetId((currentValue) => {
          if (data.some((sheet) => String(sheet.id) === currentValue)) {
            return currentValue;
          }

          return data[0] ? String(data[0].id) : String(selectedSheetQueryId || "");
        });
      })
      .catch((error) => {
        if (isMounted) {
          setErrorMessage(error.message || "Failed to load cost estimation sheet.");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isAuthorized, selectedSheetQueryId]);

  const selectedSheet =
    sheets.find((sheet) => String(sheet.id) === selectedSheetId) || null;
  const selectedSheetMetrics = getSheetDisplayMetrics(selectedSheet);
  const summaryRows = selectedSheet
    ? [
        { label: "Raw Material Total", value: selectedSheetMetrics?.sectionTotals.raw_material },
        { label: "Manufacturing Total", value: selectedSheetMetrics?.sectionTotals.manufacturing },
        { label: "Manpower Total", value: selectedSheetMetrics?.sectionTotals.labor },
        { label: "Transport Total", value: selectedSheetMetrics?.sectionTotals.packaging },
        { label: "Overhead Total", value: selectedSheetMetrics?.sectionTotals.overhead },
        { label: "Miscellaneous Total", value: selectedSheetMetrics?.sectionTotals.miscellaneous },
        { label: "Taxable Amount", value: selectedSheetMetrics?.subtotal },
        {
          label: `Tax Amount (${parseNumericValue(selectedSheet.taxPercentage)}%)`,
          value: selectedSheetMetrics?.taxAmount,
        },
        {
          label: `Profit Margin (${parseNumericValue(selectedSheet.profitMarginPercentage)}%)`,
          value: selectedSheetMetrics?.profitMarginAmount,
        },
        { label: "Cost Per Unit", value: selectedSheetMetrics?.costPerUnit },
      ]
    : [];

  if (isCheckingAuth || !isAuthorized) {
    return null;
  }

  return (
    <>
      <main className={styles.contentArea}>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h1>Cost Estimation Sheet View</h1>
          </div>

          {errorMessage ? <div className={styles.errorBanner}>{errorMessage}</div> : null}

          {isLoading ? (
            <div className={styles.loadingState}>Loading cost estimation sheets...</div>
          ) : !sheets.length ? (
            <div className={styles.emptyStateCard}>No cost estimation sheets found.</div>
          ) : (
            <div className={styles.cardsStack}>
              <section className={styles.sectionCard}>
                <div className={styles.sectionTitleRow}>
                  <h2 className={styles.sectionTitle}>Reference Details</h2>
                </div>
                <div className={styles.sectionGrid}>
                  <div className={styles.fieldColumn}>
                    <label className={styles.fieldLabel} htmlFor="costEstimationNo">
                      CST no
                    </label>
                    <input
                      id="costEstimationNo"
                      className={`${styles.fieldInput} ${styles.fieldInputMuted}`}
                      value={selectedSheet?.costEstimationNo || ""}
                      readOnly
                      aria-readonly="true"
                    />
                  </div>

                  <div className={styles.fieldColumn}>
                    <label className={styles.fieldLabel} htmlFor="referenceNo">
                      Ref no
                    </label>
                    <select
                      id="referenceNo"
                      className={styles.fieldInput}
                      value={selectedSheetId}
                      onChange={(event) => setSelectedSheetId(event.target.value)}
                    >
                      <option value="">Choose ref no</option>
                      {sheets.map((sheet) => (
                        <option key={sheet.id} value={sheet.id}>
                          {[sheet.referenceNo, sheet.costEstimationNo].filter(Boolean).join(" / ")}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className={styles.fieldColumn}>
                    <label className={styles.fieldLabel} htmlFor="clientName">
                      Client name
                    </label>
                    <input
                      id="clientName"
                      className={`${styles.fieldInput} ${styles.fieldInputMuted}`}
                      value={selectedSheet?.clientName || ""}
                      readOnly
                      aria-readonly="true"
                    />
                  </div>

                  <div className={styles.fieldColumn}>
                    <label className={styles.fieldLabel} htmlFor="phoneNo">
                      Phone number
                    </label>
                    <input
                      id="phoneNo"
                      className={`${styles.fieldInput} ${styles.fieldInputMuted}`}
                      value={selectedSheet?.phoneNo || ""}
                      readOnly
                      aria-readonly="true"
                    />
                  </div>

                  <div className={styles.fieldColumn}>
                    <label className={styles.fieldLabel} htmlFor="companyName">
                      Company name
                    </label>
                    <input
                      id="companyName"
                      className={`${styles.fieldInput} ${styles.fieldInputMuted}`}
                      value={selectedSheet?.companyName || ""}
                      readOnly
                      aria-readonly="true"
                    />
                  </div>
                </div>
              </section>

              {selectedSheet ? (
                <>
                  {SECTION_CONFIGS.map((section) => {
                    const rows = (selectedSheet.rows || []).filter(
                      (row) => row.section === section.key,
                    );
                    const sectionTotal = parseNumericValue(
                      selectedSheetMetrics?.sectionTotals?.[section.key],
                    );

                    if (section.mode === "single_amount" && sectionTotal <= 0) {
                      return null;
                    }

                    if (section.mode !== "single_amount" && !rows.length) {
                      return null;
                    }

                    return (
                      <section key={section.key} className={styles.sectionCard}>
                        <div className={styles.sectionHeader}>
                          <h2 className={styles.sectionTitle}>{section.title}</h2>
                          <div className={styles.totalBadge}>
                            Total:{" "}
                            {formatAmount(sectionTotal)}
                          </div>
                        </div>

                        {section.mode === "single_amount" ? (
                          <div className={styles.sectionGrid}>
                            <div className={styles.fieldColumn}>
                              <label className={styles.fieldLabel} htmlFor={`${section.key}-amount`}>
                                Amount
                              </label>
                              <input
                                id={`${section.key}-amount`}
                                className={`${styles.fieldInput} ${styles.fieldInputMuted}`}
                                value={formatAmount(sectionTotal)}
                                readOnly
                                aria-readonly="true"
                              />
                            </div>
                          </div>
                        ) : (
                          <div className={styles.tableShell}>
                            <div className={styles.tableWrapper}>
                              <table className={styles.table}>
                                <thead>
                                  <tr>
                                    <th>Item</th>
                                    <th>Details</th>
                                    <th>Unit</th>
                                    <th>Rate</th>
                                    <th>No of unit</th>
                                    <th>Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rows.map((row) => (
                                    <tr key={row.id}>
                                      <td>{row.itemName || "-"}</td>
                                      <td>{row.secondaryValue || row.secondaryLabel || "-"}</td>
                                      <td>{row.unit || "-"}</td>
                                      <td className={styles.amountCell}>{formatAmount(row.rate)}</td>
                                      <td className={styles.amountCell}>
                                        {parseNumericValue(row.quantity)}
                                      </td>
                                      <td className={styles.amountCell}>{formatAmount(row.total)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </section>
                    );
                  })}

                  <div className={styles.summarySectionWrap}>
                    <section className={`${styles.sectionCard} ${styles.summarySectionCard}`}>
                      <div className={styles.summaryHeadingRow}>
                        <div>
                          <h2 className={styles.summaryTitle}>Summary</h2>
                          
                        </div>
                      </div>

                      <ul className={styles.summaryList}>
                        {summaryRows.map((row) => (
                          <li key={row.label} className={styles.summaryItem}>
                            <span>{row.label}</span>
                            <span>{formatCurrencyAmount(row.value)}</span>
                          </li>
                        ))}

                        <li className={`${styles.summaryItem} ${styles.summaryItemEmphasis}`}>
                          <span>Net Amount</span>
                          <span>{formatCurrencyAmount(selectedSheetMetrics?.finalBatteryCost)}</span>
                        </li>
                      </ul>
                    </section>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </section>
      </main>

      <ToastContainer position="top-right" autoClose={3000} />
    </>
  );
}
