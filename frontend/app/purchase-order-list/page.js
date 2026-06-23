"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FaEdit, FaEye, FaPlus, FaTrash } from "react-icons/fa";
import { ToastContainer, toast } from "react-toastify";

import { fetchWithAdminAuth } from "@/lib/admin-auth";
import {
  MONTH_OPTIONS,
  PAGE_SIZE_OPTIONS,
  matchesSelectedMonth,
} from "@/lib/list-filters";
import { showDeleteToast } from "@/lib/toast-utils";
import { useAdminPageAccess } from "@/lib/use-admin-page-access";
import { getApiErrorMessage, getQuotationCodeDisplay } from "../quotation/shared";

import "react-toastify/dist/ReactToastify.css";

import styles from "../cost-estimation-sheet-list/cost-estimation-sheet-list.module.css";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

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

async function requestRows(isJobCardMode) {
  const endpoint = isJobCardMode ? "/api/job-card/queue/" : "/api/purchase-order/";
  const response = await fetchWithAdminAuth(`${API_BASE_URL}${endpoint}`, {
    cache: "no-store",
  });
  const data = await response.json().catch(() => []);

  if (!response.ok) {
    throw new Error(
      getApiErrorMessage(
        data,
        isJobCardMode ? "Failed to load job card queue." : "Failed to load purchase orders.",
      ),
    );
  }

  return Array.isArray(data) ? data : [];
}

async function deletePurchaseOrder(id) {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/purchase-order/${id}/`, {
    method: "DELETE",
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, "Failed to delete purchase order."));
  }

  return data;
}

export default function PurchaseOrderListPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isJobCardMode = pathname === "/job-card-queue";
  const { isCheckingAuth, isAuthorized } = useAdminPageAccess(router);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [currentPage, setCurrentPage] = useState(1);
  const [deletingId, setDeletingId] = useState(null);

  const formPath = isJobCardMode ? "/opening-job-card" : "/purchase-order";
  const pageTitle = isJobCardMode ? "Job Card Queue" : "Purchase Order List";

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    let isMounted = true;

    requestRows(isJobCardMode)
      .then((rows) => {
        if (!isMounted) {
          return;
        }
        setPurchaseOrders(rows);
        setErrorMessage("");
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }
        const message = error.message || (
          isJobCardMode ? "Failed to load job card queue." : "Failed to load purchase orders."
        );
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
  }, [isAuthorized, isJobCardMode]);

  useEffect(() => {
    if (!isJobCardMode) {
      return;
    }

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
  }, [isJobCardMode, pathname, router, searchParams]);

  const normalizedSearch = searchValue.trim().toLowerCase();
  const filteredPurchaseOrders = purchaseOrders.filter((purchaseOrder) => {
    if (!matchesSelectedMonth(purchaseOrder.poDate, selectedMonth)) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    return [
      purchaseOrder.purchaseOrderNo,
      purchaseOrder.jobCardNo,
      purchaseOrder.quotationCode,
      purchaseOrder.attentionName,
      purchaseOrder.companyName,
      purchaseOrder.referenceNo,
      purchaseOrder.costEstimationNo,
      purchaseOrder.rfqCategory,
      purchaseOrder.rfqCategoryLabel,
      purchaseOrder.workflowLabel,
      purchaseOrder.poDate,
      purchaseOrder.poReceivedDate,
      purchaseOrder.expectedDate,
      purchaseOrder.poReference,
    ].some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
  });

  const totalPages = Math.max(1, Math.ceil(filteredPurchaseOrders.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedPurchaseOrders = filteredPurchaseOrders.slice(
    startIndex,
    startIndex + pageSize,
  );
  const pageNumbers = buildPageNumbers(safeCurrentPage, totalPages);

  const handleViewPdf = (purchaseOrder) => {
    if (!purchaseOrder.poReference) {
      return;
    }

    window.open(purchaseOrder.poReference, "_blank", "noopener,noreferrer");
  };

  const handleEdit = (purchaseOrder) => {
    router.push(`${formPath}?purchaseOrderId=${purchaseOrder.id}`);
  };

  const handleOpenJobCard = (purchaseOrder) => {
    if (purchaseOrder.purchaseOrderId) {
      router.push(`${formPath}?purchaseOrderId=${purchaseOrder.purchaseOrderId}`);
      return;
    }

    if (purchaseOrder.quotationId) {
      router.push(`${formPath}?quotationId=${purchaseOrder.quotationId}`);
    }
  };

  const handleDelete = async (purchaseOrder) => {
    const shouldDelete = window.confirm(
      `Delete ${purchaseOrder.purchaseOrderNo || "this purchase order"}?`,
    );

    if (!shouldDelete) {
      return;
    }

    setDeletingId(purchaseOrder.id);

    try {
      await deletePurchaseOrder(purchaseOrder.id);
      setPurchaseOrders((currentRows) =>
        currentRows.filter((currentRow) => currentRow.id !== purchaseOrder.id),
      );
      setErrorMessage("");
      showDeleteToast(
        isJobCardMode ? "Job card deleted successfully" : "Purchase order deleted successfully",
      );
    } catch (error) {
      setErrorMessage(error.message || "Failed to delete purchase order.");
      toast.error(error.message || "Failed to delete purchase order.");
    } finally {
      setDeletingId(null);
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
            {!isJobCardMode ? (
              <button
                type="button"
                className={styles.addButton}
                onClick={() => router.push(formPath)}
                title="Create purchase order"
                aria-label="Create purchase order"
              >
                <FaPlus />
              </button>
            ) : null}
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
                    <th>{isJobCardMode ? "Source / PO no" : "PO no"}</th>
                    <th>Quotation no</th>
                    <th>Attention</th>
                    <th>Company</th>
                    <th>RFQ ref</th>
                    <th>Cost estimation no</th>
                    <th>PO date</th>
                    <th>PO received date</th>
                    <th>Expected delivery date</th>
                    <th>PDF</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan="12" className={styles.emptyState}>
                        Loading purchase orders...
                      </td>
                    </tr>
                  ) : paginatedPurchaseOrders.length ? (
                    paginatedPurchaseOrders.map((purchaseOrder, index) => (
                      <tr key={purchaseOrder.queueKey || purchaseOrder.id}>
                        <td>{startIndex + index + 1}</td>
                        <td>{purchaseOrder.purchaseOrderNo || purchaseOrder.workflowLabel || "-"}</td>
                        <td>{getQuotationCodeDisplay(purchaseOrder)}</td>
                        <td>{purchaseOrder.attentionName || "-"}</td>
                        <td>{purchaseOrder.companyName || "-"}</td>
                        <td>{purchaseOrder.referenceNo || "-"}</td>
                        <td>{purchaseOrder.costEstimationNo || "-"}</td>
                        <td>{formatDate(purchaseOrder.poDate)}</td>
                        <td>{formatDate(purchaseOrder.poReceivedDate)}</td>
                        <td>{formatDate(purchaseOrder.expectedDate)}</td>
                        <td>
                          {purchaseOrder.poReference ? (
                            <button
                              type="button"
                              className={`${styles.actionButton} ${styles.viewAction}`}
                              onClick={() => handleViewPdf(purchaseOrder)}
                              title="View PDF"
                              aria-label="View PDF"
                            >
                              <FaEye />
                            </button>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td>
                          <div className={styles.actionGroup}>
                            {isJobCardMode ? (
                              <button
  type="button"
  onClick={() => handleOpenJobCard(purchaseOrder)}
  title={
    purchaseOrder.hasJobCard
      ? "Open saved job card"
      : "Send to opening job card"
  }
  aria-label={
    purchaseOrder.hasJobCard
      ? "Open saved job card"
      : "Send to opening job card"
  }
  style={{
    backgroundColor: "#d1fae5", 
    border: "1px solid #22c55e", 
    color: "#166534", 
    padding: "6px 9px",
    borderRadius: "15px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: "500"
  }}
>
  createjob
</button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className={`${styles.actionButton} ${styles.editAction}`}
                                  onClick={() => handleEdit(purchaseOrder)}
                                  title="Edit purchase order"
                                  aria-label="Edit purchase order"
                                >
                                  <FaEdit />
                                </button>
                                <button
                                  type="button"
                                  className={`${styles.actionButton} ${styles.deleteAction}`}
                                  onClick={() => handleDelete(purchaseOrder)}
                                  disabled={deletingId === purchaseOrder.id}
                                  title="Delete purchase order"
                                  aria-label="Delete purchase order"
                                >
                                  <FaTrash />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="12" className={styles.emptyState}>
                        {normalizedSearch || selectedMonth
                          ? "No purchase orders match your filters."
                          : "No purchase orders found."}
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
