"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FaCheckCircle, FaEye, FaTimes } from "react-icons/fa";
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

import styles from "./cost-estimation-approval-list.module.css";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

const STAGE_CONFIG = {
  hod: {
    title: "HOD Cost Estimation List",
    workflow: "hod",
    statusKey: "hodStatus",
    statusLabel: "HOD Status",
    commentPlaceholder: "Enter HOD review comment",
    successLabel: "HOD review saved successfully",
  },
  md: {
    title: "MD Cost Estimation List",
    workflow: "md",
    statusKey: "mdStatus",
    statusLabel: "MD Status",
    commentPlaceholder: "Enter MD review comment",
    successLabel: "MD review saved successfully",
  },
};

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

function getApprovalLabel(status) {
  if (status === "approved") {
    return "Approved";
  }

  if (status === "declined") {
    return "Denied";
  }

  return "Waiting for Approval";
}

function getStatusClassName(status) {
  if (status === "approved") {
    return styles.statusApproved;
  }

  if (status === "declined") {
    return styles.statusDeclined;
  }

  return styles.statusPending;
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

async function requestCostEstimationSheets(workflow) {
  const query = workflow ? `?workflow=${encodeURIComponent(workflow)}` : "";
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/cost-estimation/sheets/${query}`, {
    cache: "no-store",
  });
  const data = await response.json().catch(() => []);

  if (!response.ok) {
    throw new Error(data.error || "Failed to load cost estimation sheets.");
  }

  return Array.isArray(data) ? data : [];
}

async function submitCostEstimationReview(id, payload) {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/cost-estimation/sheets/${id}/review/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || data.comment?.[0] || "Failed to save review.");
  }

  return data;
}

export default function CostEstimationApprovalList({ stage = "hod" }) {
  const router = useRouter();
  const config = STAGE_CONFIG[stage] || STAGE_CONFIG.hod;
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [sheets, setSheets] = useState([]);
  const [searchValue, setSearchValue] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedSheet, setSelectedSheet] = useState(null);
  const [reviewStatus, setReviewStatus] = useState("approved");
  const [reviewComment, setReviewComment] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

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

    requestCostEstimationSheets(config.workflow)
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
  }, [config.workflow, isAuthorized]);

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
      sheet[config.statusKey],
      getApprovalLabel(sheet[config.statusKey]),
      sheet.hodComment,
      sheet.mdComment,
    ].some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
  });
  const totalPages = Math.max(1, Math.ceil(filteredSheets.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedSheets = filteredSheets.slice(startIndex, startIndex + pageSize);
  const pageNumbers = buildPageNumbers(safeCurrentPage, totalPages);

  const handleOpenReview = (sheet) => {
    setSelectedSheet(sheet);
    setReviewStatus(sheet?.[config.statusKey] === "declined" ? "declined" : "approved");
    setReviewComment(sheet?.[`${stage}Comment`] || "");
  };

  const handleCloseReview = () => {
    setSelectedSheet(null);
    setReviewStatus("approved");
    setReviewComment("");
    setIsSubmittingReview(false);
  };

  const handleSubmitReview = async (event) => {
    event.preventDefault();

    if (!selectedSheet) {
      return;
    }

    const trimmedComment = reviewComment.trim();
    if (!trimmedComment) {
      toast.error("Comment is required.");
      return;
    }

    setIsSubmittingReview(true);

    try {
      const response = await submitCostEstimationReview(selectedSheet.id, {
        stage,
        status: reviewStatus,
        comment: trimmedComment,
      });
      const updatedSheet = response.data;

      setSheets((currentSheets) =>
        currentSheets.filter((sheet) => sheet.id !== updatedSheet.id),
      );
      setErrorMessage("");
      toast.success(response.message || config.successLabel);
      handleCloseReview();
    } catch (error) {
      toast.error(error.message || "Failed to save review.");
    } finally {
      setIsSubmittingReview(false);
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
            <h1 className={styles.title}>{config.title}</h1>
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
                    
                    <th>{config.statusLabel}</th>
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
                        
                        <td>
                          <span
                            className={`${styles.statusBadge} ${getStatusClassName(
                              sheet[config.statusKey],
                            )}`}
                          >
                            {getApprovalLabel(sheet[config.statusKey])}
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
                              className={`${styles.actionButton} ${styles.reviewAction}`}
                              onClick={() => handleOpenReview(sheet)}
                              title={`Review ${stage.toUpperCase()} status`}
                              aria-label={`Review ${stage.toUpperCase()} status`}
                            >
                              <FaCheckCircle />
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

      {selectedSheet ? (
        <div
          className={styles.modalBackdrop}
          onClick={handleCloseReview}
          role="presentation"
        >
          <div
            className={styles.modalCard}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`${stage.toUpperCase()} review`}
          >
            <div className={styles.modalHeader}>
              <div>
                <h2 className={styles.modalTitle}>{config.statusLabel} Review</h2>
                <p className={styles.modalSubtitle}>
                  {selectedSheet.costEstimationNo || selectedSheet.referenceNo || "-"}
                </p>
              </div>
              <button
                type="button"
                className={styles.modalCloseButton}
                onClick={handleCloseReview}
                aria-label="Close review popup"
              >
                <FaTimes />
              </button>
            </div>

            <form className={styles.modalForm} onSubmit={handleSubmitReview}>
              <div className={styles.radioGroup}>
                <label className={styles.radioOption}>
                  <input
                    type="radio"
                    name="approvalStatus"
                    value="approved"
                    checked={reviewStatus === "approved"}
                    onChange={(event) => setReviewStatus(event.target.value)}
                  />
                  <span>Approved</span>
                </label>
                <label className={styles.radioOption}>
                  <input
                    type="radio"
                    name="approvalStatus"
                    value="declined"
                    checked={reviewStatus === "declined"}
                    onChange={(event) => setReviewStatus(event.target.value)}
                  />
                  <span>Declined</span>
                </label>
              </div>

              <div className={styles.commentBlock}>
                <label className={styles.commentLabel} htmlFor="approval-comment">
                  Comment
                </label>
                <textarea
                  id="approval-comment"
                  className={styles.commentInput}
                  value={reviewComment}
                  onChange={(event) => setReviewComment(event.target.value)}
                  placeholder={config.commentPlaceholder}
                  rows={4}
                />
              </div>

              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={handleCloseReview}
                  disabled={isSubmittingReview}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.submitButton}
                  disabled={isSubmittingReview}
                >
                  {isSubmittingReview ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <ToastContainer position="top-right" autoClose={3000} />
    </>
  );
}
