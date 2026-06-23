"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FaEdit, FaEye, FaPaperPlane, FaPlus, FaTrash } from "react-icons/fa";
import { ToastContainer, toast } from "react-toastify";

import "react-toastify/dist/ReactToastify.css";

import {
  clearStoredAdminAuth,
  fetchWithAdminAuth,
  getStoredAdminAuth,
  verifyAdminAccess,
} from "@/lib/admin-auth";
import {
  MONTH_OPTIONS,
  PAGE_SIZE_OPTIONS,
  matchesSelectedMonth,
} from "@/lib/list-filters";
import { showDeleteToast } from "@/lib/toast-utils";

import styles from "./cost-estimation-sheet-list.module.css";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

function parseNumericValue(value) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function formatCurrencyAmount(value) {
  return `\u20b9${parseNumericValue(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const parsedDate = new Date(value);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getSheetDisplayMetrics(sheet) {
  const subtotal =
    parseNumericValue(sheet?.rawMaterialTotal) +
    parseNumericValue(sheet?.processTotal) +
    parseNumericValue(sheet?.laborTotal) +
    parseNumericValue(sheet?.packagingTotal) +
    parseNumericValue(sheet?.overheadTotal) +
    parseNumericValue(sheet?.miscellaneousTotal);
  const taxAmount = subtotal * (parseNumericValue(sheet?.taxPercentage) / 100);
  const profitMarginAmount = subtotal * (parseNumericValue(sheet?.profitMarginPercentage) / 100);
  const finalBatteryCost = subtotal + taxAmount + profitMarginAmount;
  const derivedQuantity =
    parseNumericValue(sheet?.costPerUnit) > 0
      ? parseNumericValue(sheet?.finalBatteryCost) / parseNumericValue(sheet?.costPerUnit)
      : 0;
  const costPerUnit =
    derivedQuantity > 0 ? finalBatteryCost / derivedQuantity : parseNumericValue(sheet?.costPerUnit);

  return {
    finalBatteryCost,
    costPerUnit,
  };
}

function getOverallStatusLabel(status) {
  if (status === "approved") {
    return "Approved";
  }

  if (status === "declined") {
    return "Denied";
  }

  return "Waiting for Approval";
}

function isSheetWorkflowLocked(sheet) {
  return Boolean(sheet?.isReadOnly);
}

function buildPageNumbers(currentPage, totalPages) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 3) {
    return [1, 2, 3, 4, 5];
  }

  if (currentPage >= totalPages - 2) {
    return [
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }

  return [
    currentPage - 2,
    currentPage - 1,
    currentPage,
    currentPage + 1,
    currentPage + 2,
  ];
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

async function removeCostEstimationSheet(id) {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/cost-estimation/sheets/${id}/`, {
    method: "DELETE",
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Failed to delete cost estimation sheet.");
  }

  return data;
}

async function sendCostEstimationSheetToHead(id) {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/cost-estimation/sheets/${id}/send-to-head/`, {
    method: "POST",
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Failed to send cost estimation sheet to HOD.");
  }

  return data;
}

export default function CostEstimationSheetListPage() {
  const router = useRouter();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [sheets, setSheets] = useState([]);
  const [searchValue, setSearchValue] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [currentPage, setCurrentPage] = useState(1);

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

    requestCostEstimationSheets()
      .then((data) => {
        if (isMounted) {
          setErrorMessage("");
          setSheets(data);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setErrorMessage(error.message || "Failed to load cost estimation sheets.");
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
  }, [isAuthorized]);

  const normalizedSearch = searchValue.trim().toLowerCase();
  const sheetsWithDisplayMetrics = sheets.map((sheet) => ({
    ...sheet,
    displayMetrics: getSheetDisplayMetrics(sheet),
  }));
  const filteredSheets = sheetsWithDisplayMetrics.filter((sheet) => {
    if (!matchesSelectedMonth(sheet.created_at, selectedMonth)) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    return [
      sheet.costEstimationNo,
      sheet.referenceNo,
      sheet.clientName,
      sheet.companyName,
      sheet.phoneNo,
      sheet.displayMetrics.finalBatteryCost,
      sheet.displayMetrics.costPerUnit,
      sheet.created_at,
      formatDateTime(sheet.created_at),
      sheet.overallStatus,
      getOverallStatusLabel(sheet.overallStatus),
      sheet.hodComment,
      sheet.mdComment,
    ].some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
  });
  const totalPages = Math.max(1, Math.ceil(filteredSheets.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedSheets = filteredSheets.slice(startIndex, startIndex + pageSize);
  const pageNumbers = buildPageNumbers(safeCurrentPage, totalPages);

  const handleDelete = async (sheet) => {
    if (isSheetWorkflowLocked(sheet)) {
      toast.error("Approved or in-review cost estimation sheets cannot be deleted.");
      return;
    }

    const shouldDelete = window.confirm(
      `Delete ${sheet.costEstimationNo || "this cost estimation sheet"}?`,
    );

    if (!shouldDelete) {
      return;
    }

    try {
      await removeCostEstimationSheet(sheet.id);
      setSheets((currentSheets) =>
        currentSheets.filter((currentSheet) => currentSheet.id !== sheet.id),
      );
      setErrorMessage("");
      showDeleteToast("Cost estimation sheet deleted successfully");
    } catch (error) {
      const message = error.message || "Failed to delete cost estimation sheet.";
      setErrorMessage(message);
      toast.error(message);
    }
  };

  const handleSendToHead = async (sheet) => {
    if (isSheetWorkflowLocked(sheet)) {
      return;
    }

    try {
      const response = await sendCostEstimationSheetToHead(sheet.id);
      setSheets((currentSheets) =>
        currentSheets.map((currentSheet) =>
          currentSheet.id === sheet.id ? response.data : currentSheet,
        ),
      );
      setErrorMessage("");
      toast.success(response.message || "Cost estimation sheet sent to HOD successfully");
    } catch (error) {
      const message = error.message || "Failed to send cost estimation sheet to HOD.";
      setErrorMessage(message);
      toast.error(message);
    }
  };

  if (isCheckingAuth || !isAuthorized) {
    return null;
  }

  return (
    <>
      <main className={styles.contentArea}>
        <section className={styles.card}>
          <div className={styles.header}>
            <h1 className={styles.title}>Cost Estimation Table List</h1>
            <button
              type="button"
              className={styles.addButton}
              onClick={() => router.push("/cost-estimation-sheet")}
              title="Add cost estimation sheet"
              aria-label="Add cost estimation sheet"
            >
              <FaPlus />
            </button>
          </div>

          {errorMessage ? <div className={styles.errorBanner}>{errorMessage}</div> : null}

          <div className={styles.controlsRow}>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Search"
              value={searchValue}
              onChange={(event) => {
                setSearchValue(event.target.value);
                setCurrentPage(1);
              }}
            />
            <select
              className={`${styles.filterSelect} ${styles.monthSelect}`}
              value={selectedMonth}
              onChange={(event) => {
                setSelectedMonth(event.target.value);
                setCurrentPage(1);
              }}
            >
              {MONTH_OPTIONS.map((option) => (
                <option key={option.value || "all-months"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              className={`${styles.filterSelect} ${styles.pageSizeSelect}`}
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setCurrentPage(1);
              }}
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.tableShell}>
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>CST no</th>
                    <th>Ref no</th>
                    <th>Client name</th>
                    <th>Company name</th>
                    <th>Phone number</th>
                    <th>Final battery cost</th>
                    <th>Cost per unit</th>
                    <th>Saved at</th>
                    <th>Status</th>
                    <th>HOD comment</th>
                    <th>MD comment</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan="13" className={styles.emptyState}>
                        Loading cost estimation sheets...
                      </td>
                    </tr>
                  ) : paginatedSheets.length ? (
                    paginatedSheets.map((sheet, index) => (
                      <tr key={sheet.id}>
                        <td>{startIndex + index + 1}</td>
                        <td>{sheet.costEstimationNo || "-"}</td>
                        <td>{sheet.referenceNo || "-"}</td>
                        <td>{sheet.clientName || "-"}</td>
                        <td>{sheet.companyName || "-"}</td>
                        <td>{sheet.phoneNo || "-"}</td>
                        <td className={styles.amountCell}>
                          {formatCurrencyAmount(sheet.displayMetrics.finalBatteryCost)}
                        </td>
                        <td className={styles.amountCell}>
                          {formatCurrencyAmount(sheet.displayMetrics.costPerUnit)}
                        </td>
                        <td>{formatDateTime(sheet.created_at)}</td>
                        <td>
                          <span
                            className={`${styles.statusBadge} ${
                              sheet.overallStatus === "approved"
                                ? styles.statusApproved
                                : sheet.overallStatus === "declined"
                                  ? styles.statusDeclined
                                  : styles.statusPending
                            }`}
                          >
                            {getOverallStatusLabel(sheet.overallStatus)}
                          </span>
                        </td>
                        <td className={styles.commentCell}>{sheet.hodComment || "-"}</td>
                        <td className={styles.commentCell}>{sheet.mdComment || "-"}</td>
                        <td>
                          <div className={styles.actionGroup}>
                            <button
                              type="button"
                              className={`${styles.actionButton} ${styles.viewAction}`}
                              onClick={() =>
                                router.push(`/cost-estimation-sheet-view?sheetId=${sheet.id}`)
                              }
                              title="View cost estimation sheet"
                              aria-label="View cost estimation sheet"
                            >
                              <FaEye />
                            </button>
                            <button
                              type="button"
                              className={`${styles.actionButton} ${styles.editAction}`}
                              onClick={() =>
                                router.push(`/cost-estimation-sheet?sheetId=${sheet.id}`)
                              }
                              disabled={isSheetWorkflowLocked(sheet)}
                              title="Update cost estimation sheet"
                              aria-label="Update cost estimation sheet"
                            >
                              <FaEdit />
                            </button>
                            <button
                              type="button"
                              className={`${styles.actionButton} ${styles.sendAction}`}
                              onClick={() => handleSendToHead(sheet)}
                              disabled={isSheetWorkflowLocked(sheet)}
                              title={sheet.sentToHead ? "Resend to HOD" : "Send to HOD"}
                              aria-label={sheet.sentToHead ? "Resend to HOD" : "Send to HOD"}
                            >
                              <FaPaperPlane />
                            </button>
                            <button
                              type="button"
                              className={`${styles.actionButton} ${styles.deleteAction}`}
                              onClick={() => handleDelete(sheet)}
                              disabled={isSheetWorkflowLocked(sheet)}
                              title="Delete cost estimation sheet"
                              aria-label="Delete cost estimation sheet"
                            >
                              <FaTrash />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="13" className={styles.emptyState}>
                        {normalizedSearch || selectedMonth
                          ? "No cost estimation sheets match your filters."
                          : "No cost estimation sheets found."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {!isLoading ? (
            <div className={styles.pagination}>
              <button
                type="button"
                className={styles.paginationButton}
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={safeCurrentPage === 1}
              >
                Prev
              </button>

              {pageNumbers.map((pageNumber) => (
                <button
                  key={pageNumber}
                  type="button"
                  className={`${styles.pageNumberButton} ${
                    pageNumber === safeCurrentPage ? styles.pageNumberActive : ""
                  }`}
                  onClick={() => setCurrentPage(pageNumber)}
                >
                  {pageNumber}
                </button>
              ))}

              <button
                type="button"
                className={styles.paginationButton}
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={safeCurrentPage === totalPages}
              >
                Next
              </button>
            </div>
          ) : null}
        </section>
      </main>

      <ToastContainer position="top-right" autoClose={3000} />
    </>
  );
}
