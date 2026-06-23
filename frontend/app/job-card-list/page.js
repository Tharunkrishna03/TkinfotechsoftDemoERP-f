"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FaEdit } from "react-icons/fa";
import { ToastContainer, toast } from "react-toastify";

import "react-toastify/dist/ReactToastify.css";

import { fetchWithAdminAuth, getStoredAdminAuth } from "@/lib/admin-auth";
import { ADMIN_ROLE, getUserRoles, OPERATION_HEAD_ROLE } from "@/lib/admin-access";
import {
  MONTH_OPTIONS,
  PAGE_SIZE_OPTIONS,
  matchesSelectedMonth,
} from "@/lib/list-filters";
import { useAdminPageAccess } from "@/lib/use-admin-page-access";
import { getQuotationCodeDisplay } from "../quotation/shared";

import styles from "../cost-estimation-sheet-list/cost-estimation-sheet-list.module.css";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

const APPROVE_BUTTON_STYLE = {
  border: "1px solid #1d4ed8",
  borderRadius: "999px",
  background: "#dbeafe",
  color: "#1d4ed8",
  padding: "6px 10px",
  fontSize: "11px",
  fontWeight: 600,
  cursor: "pointer",
};

const NOTIFY_STORE_BUTTON_STYLE = {
  border: "1px solid #b45309",
  borderRadius: "999px",
  background: "#fef3c7",
  color: "#b45309",
  padding: "6px 10px",
  fontSize: "11px",
  fontWeight: 600,
  cursor: "pointer",
};

const NOTIFY_HOD_BUTTON_STYLE = {
  border: "1px solid #047857",
  borderRadius: "999px",
  background: "#d1fae5",
  color: "#047857",
  padding: "6px 10px",
  fontSize: "11px",
  fontWeight: 600,
  cursor: "pointer",
};

function getDisabledButtonStyle(baseStyle) {
  return {
    ...baseStyle,
    opacity: 0.58,
    cursor: "not-allowed",
  };
}

const APPROVE_BUTTON_DISABLED_STYLE = getDisabledButtonStyle(APPROVE_BUTTON_STYLE);
const NOTIFY_STORE_BUTTON_DISABLED_STYLE = getDisabledButtonStyle(
  NOTIFY_STORE_BUTTON_STYLE,
);
const NOTIFY_HOD_BUTTON_DISABLED_STYLE = getDisabledButtonStyle(
  NOTIFY_HOD_BUTTON_STYLE,
);

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

async function requestJobCards(workflow = "") {
  const queryParams = new URLSearchParams();
  if (workflow) {
    queryParams.set("workflow", workflow);
  }

  const query = queryParams.toString();
  const response = await fetchWithAdminAuth(
    `${API_BASE_URL}/api/job-card/${query ? `?${query}` : ""}`,
    {
      cache: "no-store",
    },
  );
  const data = await response.json().catch(() => []);

  if (!response.ok) {
    throw new Error("Failed to load job cards.");
  }

  return Array.isArray(data) ? data : [];
}

async function approveStoreManagerJobCard(id, comment) {
  const response = await fetchWithAdminAuth(
    `${API_BASE_URL}/api/job-card/${id}/store-manager-approve/`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ comment }),
    },
  );
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Failed to approve job card.");
  }

  return data;
}

async function notifyStoreManagerJobCard(id) {
  const response = await fetchWithAdminAuth(
    `${API_BASE_URL}/api/job-card/${id}/notify-store/`,
    {
      method: "POST",
    },
  );
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Failed to send job card to Store Manager.");
  }

  return data;
}

function requestStoreManagerComment(existingComment = "") {
  if (typeof window === "undefined") {
    return "";
  }

  return window.prompt("Enter Store Manager comment", existingComment) ?? null;
}

async function sendJobCardToHod(id) {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/job-card/${id}/send-to-hod/`, {
    method: "POST",
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Failed to send job card to HOD.");
  }

  return data;
}

export function JobCardListPage({
  title = "Job Card List",
  workflow = "",
  readOnly = false,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isCheckingAuth, isAuthorized } = useAdminPageAccess(router);
  const isStoreManagerWorkflow = workflow === "store_manager";
  const [jobCards, setJobCards] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [currentPage, setCurrentPage] = useState(1);
  const [actionJobCardId, setActionJobCardId] = useState(null);
  const [canManageStoreWorkflow, setCanManageStoreWorkflow] = useState(false);

  useEffect(() => {
    const currentUser = getStoredAdminAuth()?.user || null;
    setCanManageStoreWorkflow(
      getUserRoles(currentUser).some(
        (role) => role === ADMIN_ROLE || role === OPERATION_HEAD_ROLE,
      ),
    );
  }, []);

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    requestJobCards(workflow)
      .then((rows) => {
        if (!isMounted) {
          return;
        }

        setJobCards(rows);
        setErrorMessage("");
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        const message = error.message || "Failed to load job cards.";
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
  }, [isAuthorized, workflow]);

  useEffect(() => {
    const jobCardSaved = searchParams.get("jobCardSaved");
    if (!jobCardSaved) {
      return;
    }

    toast.success(
      jobCardSaved === "updated"
        ? "Job card updated successfully"
        : "Job card saved successfully",
    );
    router.replace(pathname);
  }, [pathname, router, searchParams]);

  const normalizedSearch = searchValue.trim().toLowerCase();
  const filteredJobCards = jobCards.filter((jobCard) => {
    if (!matchesSelectedMonth(jobCard.jobCardDate, selectedMonth)) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    return [
      jobCard.jobCardNo,
      jobCard.purchaseOrderNo,
      jobCard.quotationCode,
      jobCard.rfqNo,
      jobCard.rfqTypeLabel,
      jobCard.rfqCategoryLabel,
      jobCard.attentionName,
      jobCard.companyName,
      jobCard.jobCardDate,
      jobCard.planningDate,
      jobCard.expectedDate,
      jobCard.remarks,
      jobCard.deliveryRemark,
      formatDate(jobCard.jobCardDate),
      formatDate(jobCard.planningDate),
      formatDate(jobCard.expectedDate),
      formatDateTime(jobCard.created_at),
    ].some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
  });

  const totalPages = Math.max(1, Math.ceil(filteredJobCards.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedJobCards = filteredJobCards.slice(startIndex, startIndex + pageSize);
  const pageNumbers = buildPageNumbers(safeCurrentPage, totalPages);

  const handleEdit = (jobCard) => {
    if (jobCard?.purchaseOrder) {
      router.push(`/opening-job-card?purchaseOrderId=${jobCard.purchaseOrder}`);
      return;
    }

    if (!jobCard?.quotation) {
      return;
    }

    router.push(`/opening-job-card?quotationId=${jobCard.quotation}`);
  };

  const handleOpenOperationRegister = (jobCard) => {
    if (!jobCard?.id) {
      return;
    }

    router.push(`/operation-register?jobCardId=${jobCard.id}`);
  };

  const handleNotifyStore = (jobCard) => {
    if (
      !jobCard?.requiresStoreManagerApproval ||
      jobCard.sentToStoreManager ||
      jobCard.sentToHod
    ) {
      return;
    }

    setActionJobCardId(jobCard.id);

    notifyStoreManagerJobCard(jobCard.id)
      .then((response) => {
        const updatedJobCard = response.data;
        setJobCards((currentJobCards) =>
          currentJobCards.map((currentJobCard) =>
            currentJobCard.id === updatedJobCard.id ? updatedJobCard : currentJobCard,
          ),
        );
        setErrorMessage("");
        toast.success(response.message || "Job card sent to Store Manager successfully.");
      })
      .catch((error) => {
        const message = error.message || "Failed to send job card to Store Manager.";
        setErrorMessage(message);
        toast.error(message);
      })
      .finally(() => {
        setActionJobCardId(null);
      });
  };

  const handleStoreManagerApprove = async (jobCard) => {
    const comment = requestStoreManagerComment(jobCard?.storeManagerComment || "");
    if (comment === null) {
      return;
    }

    if (!comment.trim()) {
      const message = "Store Manager comment is required before approval.";
      setErrorMessage(message);
      toast.error(message);
      return;
    }

    setActionJobCardId(jobCard.id);

    try {
      const response = await approveStoreManagerJobCard(jobCard.id, comment.trim());
      const updatedJobCard = response.data;
      setJobCards((currentJobCards) =>
        currentJobCards.map((currentJobCard) =>
          currentJobCard.id === updatedJobCard.id ? updatedJobCard : currentJobCard,
        ),
      );
      setErrorMessage("");
      toast.success(response.message || "Store Manager approved the job card successfully.");
    } catch (error) {
      const message = error.message || "Failed to approve job card.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setActionJobCardId(null);
    }
  };

  const handleSendToHod = async (jobCard) => {
    setActionJobCardId(jobCard.id);

    try {
      const response = await sendJobCardToHod(jobCard.id);
      const updatedJobCard = response.data;
      setJobCards((currentJobCards) =>
        currentJobCards.map((currentJobCard) =>
          currentJobCard.id === updatedJobCard.id ? updatedJobCard : currentJobCard,
        ),
      );
      setErrorMessage("");
      toast.success(response.message || "Job card sent to HOD successfully.");
    } catch (error) {
      const message = error.message || "Failed to send job card to HOD.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setActionJobCardId(null);
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
            <h1 className={styles.title}>{title}</h1>
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
                    <th>Job card no</th>
                    <th>GRN no</th>
                    <th>PO no</th>
                    <th>Quotation no</th>
                    <th>RFQ no</th>
                    <th>Attention</th>
                    <th>Company</th>
                    <th>Job card date</th>
                    <th>Planning date</th>
                    <th>Expected date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan="12" className={styles.emptyState}>
                        Loading job cards...
                      </td>
                    </tr>
                  ) : paginatedJobCards.length ? (
                    paginatedJobCards.map((jobCard, index) => {
                      const isWorkshopJobCard = Boolean(
                        jobCard.requiresStoreManagerApproval,
                      );
                      const supportsDirectHodNotification =
                        jobCard.rfqType === "spare" || jobCard.rfqType === "onsite";
                      const notifyStoreDisabled =
                        actionJobCardId === jobCard.id ||
                        !isWorkshopJobCard ||
                        jobCard.sentToStoreManager ||
                        jobCard.sentToHod;
                      const notifyHodDisabled =
                        actionJobCardId === jobCard.id ||
                        (
                          isWorkshopJobCard &&
                          (
                            !jobCard.sentToStoreManager ||
                            !jobCard.storeManagerApproved
                          )
                        ) ||
                        jobCard.sentToHod ||
                        !canManageStoreWorkflow;

                      return (
                        <tr key={jobCard.id}>
                          <td>{startIndex + index + 1}</td>
                          <td>{jobCard.jobCardNo || "-"}</td>
                          <td>{jobCard.grnNo || "-"}</td>
                          <td>{jobCard.purchaseOrderNo || "-"}</td>
                          <td>{getQuotationCodeDisplay(jobCard)}</td>
                          <td>{jobCard.rfqNo || "-"}</td>
                          <td>{jobCard.attentionName || "-"}</td>
                          <td>{jobCard.companyName || "-"}</td>
                          <td>{formatDate(jobCard.jobCardDate)}</td>
                          <td>{formatDate(jobCard.planningDate)}</td>
                          <td>{formatDate(jobCard.expectedDate)}</td>
                          <td>
                            {isStoreManagerWorkflow ? (
                              <div className={styles.actionGroup}>
                                <button
                                  type="button"
                                  onClick={() => handleStoreManagerApprove(jobCard)}
                                  disabled={
                                    actionJobCardId === jobCard.id ||
                                    jobCard.storeManagerApproved ||
                                    !canManageStoreWorkflow
                                  }
                                  title={
                                    !canManageStoreWorkflow
                                      ? "Only Store Manager can approve"
                                      : jobCard.storeManagerApproved
                                        ? "Already approved by Store Manager"
                                        : "Approve with Store Manager comment"
                                  }
                                  style={
                                    actionJobCardId === jobCard.id ||
                                    jobCard.storeManagerApproved ||
                                    !canManageStoreWorkflow
                                      ? APPROVE_BUTTON_DISABLED_STYLE
                                      : APPROVE_BUTTON_STYLE
                                  }
                                >
                                  {jobCard.storeManagerApproved ? "Approved" : "Approve"}
                                </button>
                              </div>
                            ) : workflow === "hod" ? (
                              <div className={styles.actionGroup}>
                                <button
                                  type="button"
                                  onClick={() => handleOpenOperationRegister(jobCard)}
                                  style={NOTIFY_HOD_BUTTON_STYLE}
                                  title={
                                    jobCard.hasOperationRegister
                                      ? "Open operation register"
                                      : "Create operation register"
                                  }
                                >
                                  {jobCard.hasOperationRegister ? "Open Op Register" : "Op Register"}
                                </button>
                              </div>
                            ) : readOnly ? (
                              "-"
                            ) : (
                              <div className={styles.actionGroup}>
                                {isWorkshopJobCard ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleNotifyStore(jobCard)}
                                      disabled={notifyStoreDisabled}
                                      title={
                                        jobCard.sentToHod
                                          ? "Already sent to HOD"
                                          : jobCard.storeManagerApproved
                                            ? "Already approved by Store Manager"
                                          : jobCard.sentToStoreManager
                                            ? "Already sent to Store Manager"
                                            : "Notify Store Manager"
                                      }
                                      style={
                                        notifyStoreDisabled
                                          ? NOTIFY_STORE_BUTTON_DISABLED_STYLE
                                          : NOTIFY_STORE_BUTTON_STYLE
                                      }
                                    >
                                      {jobCard.storeManagerApproved
                                        ? "Store Approved"
                                        : jobCard.sentToStoreManager
                                          ? "Sent Store"
                                          : "Notify Store"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleSendToHod(jobCard)}
                                      disabled={notifyHodDisabled}
                                      title={
                                        !canManageStoreWorkflow
                                          ? "Only Store Manager can notify HOD"
                                          : jobCard.sentToHod
                                            ? "Already sent to HOD"
                                            : jobCard.storeManagerApproved
                                              ? "Notify HOD"
                                              : "Read only until Store Manager approval"
                                      }
                                      style={
                                        notifyHodDisabled
                                          ? NOTIFY_HOD_BUTTON_DISABLED_STYLE
                                          : NOTIFY_HOD_BUTTON_STYLE
                                      }
                                    >
                                      {jobCard.sentToHod ? "HOD Notified" : "Notify HOD"}
                                    </button>
                                  </>
                                ) : supportsDirectHodNotification ? (
                                  <button
                                    type="button"
                                    onClick={() => handleSendToHod(jobCard)}
                                    disabled={
                                      actionJobCardId === jobCard.id ||
                                      jobCard.sentToHod ||
                                      !canManageStoreWorkflow
                                    }
                                    title={
                                      !canManageStoreWorkflow
                                        ? "Only Store Manager can notify HOD"
                                        : jobCard.sentToHod
                                          ? "Already sent to HOD"
                                          : "Notify HOD"
                                    }
                                    style={
                                      actionJobCardId === jobCard.id ||
                                      jobCard.sentToHod ||
                                      !canManageStoreWorkflow
                                        ? NOTIFY_HOD_BUTTON_DISABLED_STYLE
                                        : NOTIFY_HOD_BUTTON_STYLE
                                    }
                                  >
                                    {jobCard.sentToHod ? "HOD Notified" : "Notify HOD"}
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  className={`${styles.actionButton} ${styles.editAction}`}
                                  onClick={() => handleEdit(jobCard)}
                                  title="Edit job card"
                                  aria-label="Edit job card"
                                >
                                  <FaEdit />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan="12" className={styles.emptyState}>
                        {normalizedSearch || selectedMonth
                          ? "No job cards match your filters."
                          : "No job cards found."}
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

export default JobCardListPage;
