"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FaCheckCircle, FaEye, FaTimes } from "react-icons/fa";
import { ToastContainer, toast } from "react-toastify";

import "react-toastify/dist/ReactToastify.css";

import {
  clearStoredAdminAuth,
  getStoredAdminAuth,
  verifyAdminAccess,
} from "@/lib/admin-auth";
import {
  MONTH_OPTIONS,
  PAGE_SIZE_OPTIONS,
  matchesSelectedMonth,
} from "@/lib/list-filters";
import {
  requestQuotations,
  submitQuotationReview,
} from "@/app/quotation/api";
import { getQuotationCodeDisplay, toNumericValue } from "@/app/quotation/shared";

import styles from "./cost-estimation-approval-list.module.css";

const STAGE_CONFIG = {
  hod: {
    title: "HOD Quotation List",
    workflow: "hod",
    statusKey: "hodStatus",
    statusLabel: "HOD Status",
    commentPlaceholder: "Enter HOD review comment",
    successLabel: "HOD review saved successfully",
  },
  md: {
    title: "MD Quotation List",
    workflow: "md",
    statusKey: "mdStatus",
    statusLabel: "MD Status",
    commentPlaceholder: "Enter MD review comment",
    successLabel: "MD review saved successfully",
  },
};

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const parsedDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return parsedDate.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatQuotationAmount(quotation) {
  const rateToInr = toNumericValue(quotation?.currencyRateToInr) || 1;
  const convertedAmount = toNumericValue(quotation?.totalCost) / rateToInr;
  const precision = quotation?.currencyCode === "OMR" ? 3 : 2;
  const prefix =
    quotation?.currencyCode === "OMR"
      ? "OMR "
      : String(quotation?.currencySymbol || "").trim();

  return `${prefix}${convertedAmount.toLocaleString("en-IN", {
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  })}`;
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

export default function QuotationApprovalList({
  stage = "hod",
  planningType = "",
  title = "",
}) {
  const router = useRouter();
  const config = STAGE_CONFIG[stage] || STAGE_CONFIG.hod;
  const pageTitle = title || config.title;
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [quotations, setQuotations] = useState([]);
  const [searchValue, setSearchValue] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedQuotation, setSelectedQuotation] = useState(null);
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

    requestQuotations(config.workflow, { planningType })
      .then((data) => {
        if (isMounted) {
          setErrorMessage("");
          setQuotations(data);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setErrorMessage(error.message || "Failed to load quotations.");
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
  }, [config.workflow, isAuthorized, planningType]);

  const normalizedSearch = searchValue.trim().toLowerCase();
  const filteredQuotations = quotations.filter((quotation) => {
    if (!matchesSelectedMonth(quotation.quotationDate, selectedMonth)) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    return [
      quotation.quotationCode,
      quotation.attentionName,
      quotation.companyName,
      quotation.referenceNo,
      quotation.costEstimationNo,
      quotation.quotationDate,
      quotation.expiryDate,
      quotation.currencyCode,
      quotation.revisedNo,
      quotation.quoteValidityDays,
      quotation.totalCost,
      formatQuotationAmount(quotation),
      quotation[config.statusKey],
      getApprovalLabel(quotation[config.statusKey]),
      quotation.hodComment,
      quotation.mdComment,
    ].some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
  });
  const totalPages = Math.max(1, Math.ceil(filteredQuotations.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedQuotations = filteredQuotations.slice(startIndex, startIndex + pageSize);
  const pageNumbers = buildPageNumbers(safeCurrentPage, totalPages);

  const handleView = (quotation) => {
    if (!quotation?.id) {
      toast.error("Quotation view is not available.");
      return;
    }

    router.push(`/quotation/print?id=${quotation.id}`);
  };

  const handleOpenReview = (quotation) => {
    setSelectedQuotation(quotation);
    setReviewStatus(quotation?.[config.statusKey] === "declined" ? "declined" : "approved");
    setReviewComment(quotation?.[`${stage}Comment`] || "");
  };

  const handleCloseReview = () => {
    setSelectedQuotation(null);
    setReviewStatus("approved");
    setReviewComment("");
    setIsSubmittingReview(false);
  };

  const handleSubmitReview = async (event) => {
    event.preventDefault();

    if (!selectedQuotation) {
      return;
    }

    const trimmedComment = reviewComment.trim();
    if (!trimmedComment) {
      toast.error("Comment is required.");
      return;
    }

    setIsSubmittingReview(true);

    try {
      const response = await submitQuotationReview(selectedQuotation.id, {
        stage,
        status: reviewStatus,
        comment: trimmedComment,
      });
      const updatedQuotation = response.data;

      setQuotations((currentQuotations) =>
        currentQuotations.filter((quotation) => quotation.id !== updatedQuotation.id),
      );
      setErrorMessage("");
      toast.success(response.message || config.successLabel);
      handleCloseReview();
    } catch (error) {
      toast.error(error.message || "Failed to save quotation review.");
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
            <h1 className={styles.title}>{pageTitle}</h1>
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
                    <th>Quotation code</th>
                    <th>Attention</th>
                    <th>Company</th>
                    <th>RFQ ref</th>
                    <th>Cost estimation</th>
                    <th>Quotation date</th>
                    <th>Expiry date</th>
                    <th>Total amount</th>
                    <th>Currency</th>
                    <th>{config.statusLabel}</th>
                    <th>HOD comment</th>
                    <th>MD comment</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan="14" className={styles.emptyState}>
                        Loading quotations...
                      </td>
                    </tr>
                  ) : paginatedQuotations.length ? (
                    paginatedQuotations.map((quotation, index) => (
                      <tr key={quotation.id}>
                        <td>{startIndex + index + 1}</td>
                        <td>{getQuotationCodeDisplay(quotation)}</td>
                        <td>{quotation.attentionName || "-"}</td>
                        <td>{quotation.companyName || "-"}</td>
                        <td>{quotation.referenceNo || "-"}</td>
                        <td>{quotation.costEstimationNo || "-"}</td>
                        <td>{formatDate(quotation.quotationDate)}</td>
                        <td>{formatDate(quotation.expiryDate)}</td>
                        <td className={styles.amountCell}>{formatQuotationAmount(quotation)}</td>
                        <td>{quotation.currencyCode || "-"}</td>
                        <td>
                          <span
                            className={`${styles.statusBadge} ${getStatusClassName(
                              quotation[config.statusKey],
                            )}`}
                          >
                            {getApprovalLabel(quotation[config.statusKey])}
                          </span>
                        </td>
                        <td className={styles.commentCell}>{quotation.hodComment || "-"}</td>
                        <td className={styles.commentCell}>{quotation.mdComment || "-"}</td>
                        <td>
                          <div className={styles.actionGroup}>
                            <button
                              type="button"
                              className={`${styles.actionButton} ${styles.viewAction}`}
                              onClick={() => handleView(quotation)}
                              title="View quotation"
                              aria-label="View quotation"
                            >
                              <FaEye />
                            </button>
                            <button
                              type="button"
                              className={`${styles.actionButton} ${styles.reviewAction}`}
                              onClick={() => handleOpenReview(quotation)}
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
                      <td colSpan="14" className={styles.emptyState}>
                        {normalizedSearch || selectedMonth
                          ? "No quotations match your filters."
                          : "No quotations found."}
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

      {selectedQuotation ? (
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
                  {getQuotationCodeDisplay(selectedQuotation, selectedQuotation.referenceNo || "-")}
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
