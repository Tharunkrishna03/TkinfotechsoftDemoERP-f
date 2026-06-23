"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FaEdit, FaEye, FaPaperPlane, FaPlus, FaPrint, FaTrash, FaUserCheck } from "react-icons/fa";
import { ToastContainer, toast } from "react-toastify";

import { useAdminPageAccess } from "@/lib/use-admin-page-access";
import {
  MONTH_OPTIONS,
  PAGE_SIZE_OPTIONS,
  matchesSelectedMonth,
} from "@/lib/list-filters";
import { showDeleteToast } from "@/lib/toast-utils";
import {
  clearPurchaseOrderNotification,
  readPurchaseOrderNotification,
} from "@/lib/workflow-notifications";
import {
  deleteQuotation,
  requestQuotations,
  sendQuotationToHead,
  submitQuotationClientResponse,
} from "../quotation/api";
import { buildQuotationPrintMarkup, getQuotationCurrency } from "../quotation/print-utils";
import { getQuotationCodeDisplay, toNumericValue } from "../quotation/shared";

import "react-toastify/dist/ReactToastify.css";

import styles from "../cost-estimation-sheet-list/cost-estimation-sheet-list.module.css";
import previewStyles from "../quotation/quotation.module.css";

const EDIT_MODAL_BACKDROP_STYLE = {
  position: "fixed",
  inset: 0,
  zIndex: 1100,
  display: "grid",
  placeItems: "center",
  padding: "24px",
  background: "rgba(15, 23, 42, 0.32)",
};
const EDIT_MODAL_CARD_STYLE = {
  width: "min(100%, 420px)",
  border: "1px solid rgba(188, 205, 224, 0.8)",
  borderRadius: "20px",
  background: "#ffffff",
  boxShadow: "0 18px 42px rgba(45, 74, 106, 0.18)",
  padding: "24px",
};
const EDIT_MODAL_TITLE_STYLE = {
  margin: 0,
  fontSize: "16px",
  fontWeight: 500,
  color: "#101e30",
};
const EDIT_MODAL_OPTION_STYLE = {
  display: "flex",
  alignItems: "flex-start",
  padding: "12px",
  cursor: "pointer",
};
const EDIT_MODAL_OPTION_TEXT_STYLE = {
  display: "grid",
  gap: "4px",
};
const EDIT_MODAL_FIELD_STYLE = {
  display: "grid",
  gap: "8px",
  marginTop: "14px",
};
const EDIT_MODAL_LABEL_STYLE = {
  fontSize: "12px",
  fontWeight: 600,
  color: "#425466",
};
const EDIT_MODAL_TEXTAREA_STYLE = {
  width: "100%",
  minHeight: "88px",
  border: "1px solid rgba(188, 205, 224, 0.8)",
  borderRadius: "12px",
  padding: "10px 12px",
  fontSize: "12px",
  color: "#101e30",
  resize: "vertical",
  outline: "none",
  fontFamily: "inherit",
};
const EDIT_MODAL_ACTIONS_STYLE = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "10px",
  marginTop: "20px",
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

function formatSavedAt(value) {
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

function buildQuotationPreviewMarkup(quotation) {
  return buildQuotationPrintMarkup({
    quotation,
    selectedCurrency: getQuotationCurrency(quotation),
  });
}

function isQuotationPendingApproval(quotation) {
  return quotation?.sentToHead && quotation?.overallStatus === "pending";
}

function hasJobCard(quotation) {
  return Boolean(quotation?.hasJobCard);
}

function hasPurchaseOrder(quotation) {
  return Boolean(quotation?.hasPurchaseOrder);
}

function isDirectJobCardWorkflow(quotation) {
  return (
    quotation?.planningType === "quote_after" ||
    quotation?.rfqCategory === "quote_of_assessment" ||
    quotation?.rfqCategory === "quote_of_completion"
  );
}

function isQuotationApproved(quotation) {
  return quotation?.overallStatus === "approved";
}

function isQuotationClientAccepted(quotation) {
  return quotation?.clientStatus === "accepted";
}

function isQuotationClientRejected(quotation) {
  return quotation?.clientStatus === "rejected";
}

function isQuotationWorkflowLocked(quotation) {
  return hasJobCard(quotation) || hasPurchaseOrder(quotation) || isQuotationPendingApproval(quotation) || (
    isQuotationApproved(quotation) && !isQuotationClientRejected(quotation)
  );
}

function isQuotationEditDisabled(quotation) {
  return isQuotationWorkflowLocked(quotation);
}

function isQuotationSendDisabled(quotation) {
  return isQuotationWorkflowLocked(quotation);
}

function isQuotationPrintEnabled(quotation) {
  return isQuotationApproved(quotation);
}

function isQuotationDeleteDisabled(quotation) {
  return isQuotationWorkflowLocked(quotation);
}

function getQuotationStatusLabel(quotation) {
  if (hasJobCard(quotation)) {
    return "Job Card Created";
  }

  if (hasPurchaseOrder(quotation)) {
    return "Job Card Created";
  }

  if (isDirectJobCardWorkflow(quotation) && isQuotationApproved(quotation)) {
    return "Ready for Job Card";
  }

  if (isQuotationClientAccepted(quotation)) {
    return "Client Accepted";
  }

  if (isQuotationClientRejected(quotation)) {
    return "Client Rejected";
  }

  if (quotation?.overallStatus === "approved") {
    return "Approved";
  }

  if (quotation?.overallStatus === "declined") {
    return "Denied";
  }

  if (quotation?.sentToHead) {
    return "Waiting for Approval";
  }

  return "Draft";
}

function getQuotationStatusClassName(quotation) {
  if (hasJobCard(quotation)) {
    return styles.statusApproved;
  }

  if (hasPurchaseOrder(quotation)) {
    return styles.statusApproved;
  }

  if (isQuotationClientAccepted(quotation)) {
    return styles.statusApproved;
  }

  if (isQuotationClientRejected(quotation)) {
    return styles.statusDeclined;
  }

  if (quotation?.overallStatus === "approved") {
    return styles.statusApproved;
  }

  if (quotation?.overallStatus === "declined") {
    return styles.statusDeclined;
  }

  return styles.statusPending;
}

function getQuotationClientStatusLabel(quotation) {
  if (isDirectJobCardWorkflow(quotation)) {
    return hasJobCard(quotation)
      ? "Read only after job card creation"
      : "No client response required";
  }

  if (hasPurchaseOrder(quotation)) {
    return "Read only after job card creation";
  }

  if (isQuotationClientAccepted(quotation)) {
    return "Client accepted";
  }

  if (isQuotationClientRejected(quotation)) {
    return "Client rejected";
  }

  return "Pending client response";
}

function getQuotationClientComment(quotation) {
  return String(quotation?.clientComment || "").trim();
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
export default function QuotationListPage() {
  const router = useRouter();
  const previewFrameRef = useRef(null);
  const { isCheckingAuth, isAuthorized } = useAdminPageAccess(router);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [quotations, setQuotations] = useState([]);
  const [searchValue, setSearchValue] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [currentPage, setCurrentPage] = useState(1);
  const [editDialogQuotation, setEditDialogQuotation] = useState(null);
  const [editModeChoice, setEditModeChoice] = useState("terms");
  const [clientDecisionQuotation, setClientDecisionQuotation] = useState(null);
  const [clientDecisionStatus, setClientDecisionStatus] = useState("");
  const [clientDecisionComment, setClientDecisionComment] = useState("");
  const [isSubmittingClientDecision, setIsSubmittingClientDecision] = useState(false);
  const [printPreviewQuotation, setPrintPreviewQuotation] = useState(null);
  const [isPrintingPreview, setIsPrintingPreview] = useState(false);

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    let isMounted = true;

    requestQuotations()
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
  }, [isAuthorized]);

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    const notification = readPurchaseOrderNotification();
    if (!notification?.purchaseOrderNo) {
      return;
    }

    const notificationLabel = getQuotationCodeDisplay(notification, "");
    toast.info(
      notificationLabel
        ? `${notificationLabel} moved to job card ${notification.purchaseOrderNo}.`
        : `Job card ${notification.purchaseOrderNo} created successfully.`,
    );
    clearPurchaseOrderNotification();
  }, [isAuthorized]);

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
      formatSavedAt(quotation.created_at),
      quotation.overallStatus,
      quotation.clientStatus,
      quotation.clientComment,
      getQuotationStatusLabel(quotation),
      getQuotationClientStatusLabel(quotation),
      quotation.hodComment,
      quotation.mdComment,
    ].some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
  });

  const totalPages = Math.max(1, Math.ceil(filteredQuotations.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedQuotations = filteredQuotations.slice(startIndex, startIndex + pageSize);
  const pageNumbers = buildPageNumbers(safeCurrentPage, totalPages);
  const printPreviewMarkup = printPreviewQuotation
    ? buildQuotationPreviewMarkup(printPreviewQuotation)
    : "";

  const handleSendToHead = async (quotation) => {
    if (isQuotationSendDisabled(quotation)) {
      return;
    }

    try {
      const response = await sendQuotationToHead(quotation.id);
      setQuotations((currentQuotations) =>
        currentQuotations.map((currentQuotation) =>
          currentQuotation.id === quotation.id ? response.data : currentQuotation,
        ),
      );
      setErrorMessage("");
      toast.success(response.message || "Quotation sent to HOD successfully");
    } catch (error) {
      const message = error.message || "Failed to send quotation to HOD.";
      setErrorMessage(message);
      toast.error(message);
    }
  };

  const handleEdit = (quotation) => {
    if (isQuotationEditDisabled(quotation)) {
      toast.error("Approved or in-review quotations cannot be edited.");
      return;
    }

    if (!quotation?.salesServiceRequest || !quotation?.costEstimationSheet) {
      toast.error("Linked RFQ is not available for this quotation.");
      return;
    }

    setEditModeChoice("terms");
    setEditDialogQuotation(quotation);
  };

  const handleEditChoiceConfirm = () => {
    if (!editDialogQuotation) {
      return;
    }

    if (editModeChoice === "terms") {
      router.push(`/quotation?quotationId=${editDialogQuotation.id}&editMode=terms`);
      return;
    }

    router.push(
      `/cost-estimation-sheet?sheetId=${editDialogQuotation.costEstimationSheet}&revision=1`,
    );
  };

  const handleDelete = async (quotation) => {
    if (isQuotationDeleteDisabled(quotation)) {
      toast.error("Approved or in-review quotations cannot be deleted.");
      return;
    }

    const shouldDelete = window.confirm(
      `Delete ${getQuotationCodeDisplay(quotation, "this quotation")}?`,
    );

    if (!shouldDelete) {
      return;
    }

    try {
      await deleteQuotation(quotation.id);
      setQuotations((currentQuotations) =>
        currentQuotations.filter((currentQuotation) => currentQuotation.id !== quotation.id),
      );
      setErrorMessage("");
      showDeleteToast("Quotation deleted successfully");
    } catch (error) {
      const message = error.message || "Failed to delete quotation.";
      setErrorMessage(message);
      toast.error(message);
    }
  };

  const handleOpenClientDecision = (quotation) => {
    if (hasPurchaseOrder(quotation)) {
      toast.error("This quotation is read only because a job card is already created.");
      return;
    }

    if (isDirectJobCardWorkflow(quotation)) {
      toast.error("Client response is not required for this RFQ workflow.");
      return;
    }

    if (!isQuotationApproved(quotation)) {
      toast.error("Client response is available only after HOD and MD approval.");
      return;
    }

    setClientDecisionQuotation(quotation);
    setClientDecisionStatus(
      isQuotationClientAccepted(quotation)
        ? "accepted"
        : isQuotationClientRejected(quotation)
          ? "rejected"
          : "",
    );
    setClientDecisionComment(getQuotationClientComment(quotation));
  };

  const handleCloseClientDecision = () => {
    if (isSubmittingClientDecision) {
      return;
    }

    setClientDecisionQuotation(null);
    setClientDecisionStatus("");
    setClientDecisionComment("");
  };

  const handleSubmitClientDecision = async () => {
    if (!clientDecisionQuotation || !clientDecisionStatus) {
      toast.error("Select accepted or rejected before submitting.");
      return;
    }

    setIsSubmittingClientDecision(true);

    try {
      const response = await submitQuotationClientResponse(clientDecisionQuotation.id, {
        status: clientDecisionStatus,
        comment: clientDecisionComment.trim(),
      });
      setQuotations((currentQuotations) =>
        currentQuotations.map((currentQuotation) =>
          currentQuotation.id === clientDecisionQuotation.id ? response.data : currentQuotation,
        ),
      );
      setErrorMessage("");
      toast.success(response.message || "Client response saved successfully");
      setClientDecisionQuotation(null);
      setClientDecisionStatus("");
      setClientDecisionComment("");
    } catch (error) {
      const message = error.message || "Failed to save client response.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsSubmittingClientDecision(false);
    }
  };

  const handleOpenPrintPreview = (quotation) => {
    if (!isQuotationPrintEnabled(quotation)) {
      toast.error("Print is available only after HOD and MD approval.");
      return;
    }

    setPrintPreviewQuotation(quotation);
  };

  const handleView = (quotation) => {
    if (!quotation?.id) {
      toast.error("Quotation view is not available.");
      return;
    }

    router.push(`/quotation/print?id=${quotation.id}`);
  };

  const handlePrint = async () => {
    const previewWindow = previewFrameRef.current?.contentWindow;

    if (!previewWindow) {
      toast.error("Preview is not ready yet.");
      return;
    }

    setIsPrintingPreview(true);

    try {
      previewWindow.focus();
      previewWindow.print();
    } finally {
      setIsPrintingPreview(false);
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
            <h1 className={styles.title}>Quotation List</h1>
            <button
              type="button"
              className={styles.addButton}
              onClick={() => router.push("/quotation")}
              title="Create quotation"
              aria-label="Create quotation"
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
                    <th>Quotation code</th>
                    <th>Attention</th>
                    <th>Company</th>
                    <th>RFQ ref</th>
                    <th>Cost estimation</th>
                    <th>Quotation date</th>
                    <th>Expiry date</th>
                    <th>Rev no</th>
                    <th>Validity</th>
                    <th>Total amount</th>
                    <th>Currency</th>
                    <th>Status</th>
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
                        <td>{quotation.revisedNo ?? 0}</td>
                        <td>{`${quotation.quoteValidityDays || 0} Days`}</td>
                        <td className={styles.amountCell}>{formatQuotationAmount(quotation)}</td>
                        <td>{quotation.currencyCode || "-"}</td>
                        <td>
                          <span
                            className={`${styles.statusBadge} ${getQuotationStatusClassName(
                              quotation,
                            )}`}
                          >
                            {getQuotationStatusLabel(quotation)}
                          </span>
                          {getQuotationClientComment(quotation) ? (
                            <div
                              style={{
                                marginTop: "8px",
                                fontSize: "11px",
                                lineHeight: 1.5,
                                color: "#516274",
                                whiteSpace: "pre-line",
                              }}
                            >
                              {getQuotationClientComment(quotation)}
                            </div>
                          ) : null}
                          {quotation.workflowNotice ? (
                            <div
                              style={{
                                marginTop: "8px",
                                fontSize: "11px",
                                lineHeight: 1.5,
                                color: "#0f3f78",
                                whiteSpace: "pre-line",
                                fontWeight: 600,
                              }}
                            >
                              {quotation.workflowNotice}
                            </div>
                          ) : null}
                        </td>
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
                              className={`${styles.actionButton} ${styles.editAction}`}
                              onClick={() => handleEdit(quotation)}
                              disabled={isQuotationEditDisabled(quotation)}
                              title="Edit quotation RFQ"
                              aria-label="Edit quotation RFQ"
                            >
                              <FaEdit />
                            </button>
                            <button
                              type="button"
                              className={`${styles.actionButton} ${styles.sendAction}`}
                              onClick={() => handleSendToHead(quotation)}
                              disabled={isQuotationSendDisabled(quotation)}
                              title={quotation.sentToHead ? "Resend to HOD" : "Send to HOD"}
                              aria-label={quotation.sentToHead ? "Resend to HOD" : "Send to HOD"}
                            >
                              <FaPaperPlane />
                            </button>
                            {isQuotationPrintEnabled(quotation) ? (
                              <button
                                type="button"
                                className={`${styles.actionButton} ${styles.viewAction}`}
                                onClick={() => handleOpenPrintPreview(quotation)}
                                title="Print quotation"
                                aria-label="Print quotation"
                              >
                                <FaPrint />
                              </button>
                            ) : null}
                            {isQuotationApproved(quotation) && !isDirectJobCardWorkflow(quotation) ? (
                              <button
                                type="button"
                                className={`${styles.actionButton} ${styles.viewAction}`}
                                onClick={() => handleOpenClientDecision(quotation)}
                                title={getQuotationClientStatusLabel(quotation)}
                                aria-label={getQuotationClientStatusLabel(quotation)}
                              >
                                <FaUserCheck />
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className={`${styles.actionButton} ${styles.deleteAction}`}
                              onClick={() => handleDelete(quotation)}
                              disabled={isQuotationDeleteDisabled(quotation)}
                              title="Delete quotation"
                              aria-label="Delete quotation"
                            >
                              <FaTrash />
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

      {editDialogQuotation ? (
        <div
          style={EDIT_MODAL_BACKDROP_STYLE}
          onClick={() => setEditDialogQuotation(null)}
          role="presentation"
        >
          <div
            style={EDIT_MODAL_CARD_STYLE}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Choose quotation edit type"
          >
            <h2 style={EDIT_MODAL_TITLE_STYLE}>Choose edit type</h2>
            

            <div
              style={{
                display: "grid",
                gap: "12px",
                marginTop: "18px",
              }}
            >
              <label style={EDIT_MODAL_OPTION_STYLE}>
                <input
                  type="radio"
                  name="quotationEditMode"
                  value="terms"
                  checked={editModeChoice === "terms"}
                  onChange={(event) => setEditModeChoice(event.target.value)}
                />
                <span style={EDIT_MODAL_OPTION_TEXT_STYLE}>
                  <strong>Terms Change </strong>
                  
                </span>
              </label>

              <label style={EDIT_MODAL_OPTION_STYLE}>
                <input
                  type="radio"
                  name="quotationEditMode"
                  value="price"
                  checked={editModeChoice === "price"}
                  onChange={(event) => setEditModeChoice(event.target.value)}
                />
                <span style={EDIT_MODAL_OPTION_TEXT_STYLE}>
                  <strong>Scope Change </strong>
                 
                </span>
              </label>
            </div>

            <div style={EDIT_MODAL_ACTIONS_STYLE}>
              <button
                type="button"
                className={styles.paginationButton}
                onClick={() => setEditDialogQuotation(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.pageNumberButton}
                onClick={handleEditChoiceConfirm}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {clientDecisionQuotation ? (
        <div
          style={EDIT_MODAL_BACKDROP_STYLE}
          onClick={handleCloseClientDecision}
          role="presentation"
        >
          <div
            style={EDIT_MODAL_CARD_STYLE}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Choose client response"
          >
            <h2 style={EDIT_MODAL_TITLE_STYLE}>Choose client response</h2>

            <div
              style={{
                display: "grid",
                gap: "12px",
                marginTop: "18px",
              }}
            >
              <label style={EDIT_MODAL_OPTION_STYLE}>
                <input
                  type="radio"
                  name="quotationClientResponse"
                  value="accepted"
                  checked={clientDecisionStatus === "accepted"}
                  onChange={(event) => setClientDecisionStatus(event.target.value)}
                  disabled={isSubmittingClientDecision}
                />
                <span style={EDIT_MODAL_OPTION_TEXT_STYLE}>
                  <strong>Accepted</strong>
                </span>
              </label>

              <label style={EDIT_MODAL_OPTION_STYLE}>
                <input
                  type="radio"
                  name="quotationClientResponse"
                  value="rejected"
                  checked={clientDecisionStatus === "rejected"}
                  onChange={(event) => setClientDecisionStatus(event.target.value)}
                  disabled={isSubmittingClientDecision}
                />
                <span style={EDIT_MODAL_OPTION_TEXT_STYLE}>
                  <strong>Rejected</strong>
                </span>
              </label>
            </div>

            <label style={EDIT_MODAL_FIELD_STYLE}>
              <span style={EDIT_MODAL_LABEL_STYLE}>Remarks</span>
              <textarea
                value={clientDecisionComment}
                onChange={(event) => setClientDecisionComment(event.target.value)}
                style={EDIT_MODAL_TEXTAREA_STYLE}
                disabled={isSubmittingClientDecision}
              />
            </label>

            <div style={EDIT_MODAL_ACTIONS_STYLE}>
              <button
                type="button"
                className={styles.paginationButton}
                onClick={handleCloseClientDecision}
                disabled={isSubmittingClientDecision}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.pageNumberButton}
                onClick={handleSubmitClientDecision}
                disabled={isSubmittingClientDecision || !clientDecisionStatus}
              >
                {isSubmittingClientDecision ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {printPreviewQuotation ? (
        <div
          className={previewStyles.previewBackdrop}
          onClick={() => setPrintPreviewQuotation(null)}
          role="presentation"
        >
          <div
            className={previewStyles.previewCard}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Quotation print preview"
          >
            <div className={previewStyles.previewHeader}>
              <div>
                <h2 className={previewStyles.previewTitle}>Quotation Preview</h2>
                <p className={previewStyles.previewSubtitle}>
                  {getQuotationCodeDisplay(printPreviewQuotation, "Preview quotation")}
                </p>
              </div>
            </div>

            <div className={previewStyles.previewFrameShell}>
              <iframe
                ref={previewFrameRef}
                title="Quotation preview"
                className={previewStyles.previewFrame}
                srcDoc={printPreviewMarkup}
              />
            </div>

            <div className={previewStyles.previewActions}>
              <button
                type="button"
                className={previewStyles.submitBtn}
                onClick={handlePrint}
                disabled={isPrintingPreview}
              >
                {isPrintingPreview ? "Printing..." : "Print"}
              </button>
              <button
                type="button"
                className={previewStyles.cancelBtn}
                onClick={() => setPrintPreviewQuotation(null)}
                disabled={isPrintingPreview}
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
