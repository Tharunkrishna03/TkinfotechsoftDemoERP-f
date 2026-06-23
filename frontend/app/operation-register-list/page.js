"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FaPlayCircle } from "react-icons/fa";
import { ToastContainer, toast } from "react-toastify";

import "react-toastify/dist/ReactToastify.css";

import { fetchWithAdminAuth, getStoredAdminAuth } from "@/lib/admin-auth";
import { ADMIN_ROLE, HOD_ROLE, getUserRoles } from "@/lib/admin-access";
import {
  MONTH_OPTIONS,
  PAGE_SIZE_OPTIONS,
  matchesSelectedMonth,
} from "@/lib/list-filters";
import { useAdminPageAccess } from "@/lib/use-admin-page-access";

import styles from "../cost-estimation-sheet-list/cost-estimation-sheet-list.module.css";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

const ACTION_BUTTON_STYLE = {
  border: "1px solid #047857",
  borderRadius: "999px",
  background: "#d1fae5",
  color: "#047857",
  padding: "6px 10px",
  fontSize: "11px",
  fontWeight: 600,
  cursor: "pointer",
};

const ACTION_BUTTON_DISABLED_STYLE = {
  ...ACTION_BUTTON_STYLE,
  opacity: 0.58,
  cursor: "not-allowed",
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

function formatListValue(values) {
  if (!Array.isArray(values) || !values.length) {
    return "-";
  }

  return values.filter(Boolean).join(", ") || "-";
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

async function requestOperationRegisters(workflow = "") {
  const queryParams = new URLSearchParams();
  if (workflow) {
    queryParams.set("workflow", workflow);
  }

  const query = queryParams.toString();
  const response = await fetchWithAdminAuth(
    `${API_BASE_URL}/api/operation-register/${query ? `?${query}` : ""}`,
    {
      cache: "no-store",
    },
  );
  const data = await response.json().catch(() => []);

  if (!response.ok) {
    throw new Error("Failed to load operation register list.");
  }

  return Array.isArray(data) ? data : [];
}

async function assignWork(id) {
  const response = await fetchWithAdminAuth(
    `${API_BASE_URL}/api/operation-register/${id}/assign-work/`,
    {
      method: "POST",
    },
  );
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Failed to assign work.");
  }

  return data;
}

export function OperationRegisterListPage({
  title = "Operation Register List",
  workflow = "",
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isCheckingAuth, isAuthorized } = useAdminPageAccess(router);
  const isWorkQueue = workflow === "work_queue";
  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [currentPage, setCurrentPage] = useState(1);
  const [actionRowId, setActionRowId] = useState(null);
  const [canAssignWork, setCanAssignWork] = useState(false);

  useEffect(() => {
    const currentUser = getStoredAdminAuth()?.user || null;
    setCanAssignWork(
      getUserRoles(currentUser).some(
        (role) => role === ADMIN_ROLE || role === HOD_ROLE,
      ),
    );
  }, []);

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    requestOperationRegisters(workflow)
      .then((data) => {
        if (!isMounted) {
          return;
        }

        setRows(data);
        setErrorMessage("");
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }

        const message = error.message || "Failed to load operation register list.";
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
    const operationSaved = searchParams.get("operationSaved");
    if (!operationSaved) {
      return;
    }

    toast.success(
      operationSaved === "updated"
        ? "Operation register updated successfully"
        : "Operation register saved successfully",
    );
    router.replace(pathname);
  }, [pathname, router, searchParams]);

  const normalizedSearch = searchValue.trim().toLowerCase();
  const filteredRows = rows.filter((row) => {
    if (!matchesSelectedMonth(row.opDate, selectedMonth)) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    return [
      row.operationNo,
      row.jobCardNo,
      row.grnNo,
      row.rfqNo,
      row.attentionName,
      row.companyName,
      row.purchaseOrderNo,
      row.shopFloorIncharge,
      row.shopFloorInchargeLabel,
      ...(Array.isArray(row.scopeDetails) ? row.scopeDetails : []),
      ...(Array.isArray(row.services) ? row.services : []),
      row.remarks,
      row.opDate,
      row.planStartDate,
      row.planEndDate,
    ].some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
  });

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedRows = filteredRows.slice(startIndex, startIndex + pageSize);
  const pageNumbers = buildPageNumbers(safeCurrentPage, totalPages);

  const handleAssignWork = async (row) => {
    setActionRowId(row.id);

    try {
      const response = await assignWork(row.id);
      setRows((currentRows) =>
        currentRows.filter((currentRow) => currentRow.id !== row.id),
      );
      setErrorMessage("");
      toast.success(response.message || "Work assigned to Site Engineer successfully.");
    } catch (error) {
      const message = error.message || "Failed to assign work.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setActionRowId(null);
    }
  };

  const handleOpen = (row) => {
    if (!row?.jobCard) {
      return;
    }

    router.push(`/shopfloor-registration?jobCardId=${row.jobCard}`);
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
                    <th>Operation no</th>
                    <th>Op date</th>
                    <th>Job card no</th>
                    <th>GRN no</th>
                    <th>RFQ no</th>
                    <th>Attention</th>
                    <th>Company</th>
                    <th>PO no</th>
                    <th>Supervisor assigned</th>
                    {isWorkQueue ? <th>Scope</th> : null}
                    {isWorkQueue ? <th>Service</th> : null}
                    <th>Plan start</th>
                    <th>Plan end</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={isWorkQueue ? "15" : "13"} className={styles.emptyState}>
                        Loading operation registers...
                      </td>
                    </tr>
                  ) : paginatedRows.length ? (
                    paginatedRows.map((row, index) => (
                      <tr key={row.id}>
                        <td>{startIndex + index + 1}</td>
                        <td>{row.operationNo || "-"}</td>
                        <td>{formatDate(row.opDate)}</td>
                        <td>{row.jobCardNo || "-"}</td>
                        <td>{row.grnNo || "-"}</td>
                        <td>{row.rfqNo || "-"}</td>
                        <td>{row.attentionName || "-"}</td>
                        <td>{row.companyName || "-"}</td>
                        <td>{row.purchaseOrderNo || "-"}</td>
                        <td>{row.shopFloorInchargeLabel || "-"}</td>
                        {isWorkQueue ? (
                          <td>{formatListValue(row.scopeDetails)}</td>
                        ) : null}
                        {isWorkQueue ? (
                          <td>{formatListValue(row.services)}</td>
                        ) : null}
                        <td>{formatDate(row.planStartDate)}</td>
                        <td>{formatDate(row.planEndDate)}</td>
                        <td>
                          <div className={styles.actionGroup}>
                            {isWorkQueue ? (
                              <button
                                type="button"
                                className={`${styles.actionButton} ${styles.viewAction}`}
                                onClick={() => handleOpen(row)}
                                title="Open shopfloor registration"
                                aria-label="Open shopfloor registration"
                              >
                                <FaPlayCircle />
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleAssignWork(row)}
                                disabled={
                                  actionRowId === row.id ||
                                  row.assignedToSiteEngineer ||
                                  !canAssignWork
                                }
                                title={
                                  !canAssignWork
                                    ? "Only HOD can assign work"
                                    : row.assignedToSiteEngineer
                                      ? "Already assigned to Site Engineer"
                                      : "Assign work"
                                }
                                style={
                                  actionRowId === row.id ||
                                  row.assignedToSiteEngineer ||
                                  !canAssignWork
                                    ? ACTION_BUTTON_DISABLED_STYLE
                                    : ACTION_BUTTON_STYLE
                                }
                              >
                                {row.assignedToSiteEngineer ? "Assigned" : "Assign Work"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={isWorkQueue ? "15" : "13"} className={styles.emptyState}>
                        {normalizedSearch || selectedMonth
                          ? "No operation registers match your filters."
                          : "No operation registers found."}
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

export default function OperationRegisterListScreen() {
  return <OperationRegisterListPage />;
}
