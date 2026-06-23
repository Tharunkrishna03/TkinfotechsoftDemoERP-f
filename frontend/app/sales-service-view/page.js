"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FaEdit, FaEye, FaPlus, FaTrash } from "react-icons/fa";
import { ToastContainer, toast } from "react-toastify";

import {
  clearStoredAdminAuth,
  fetchWithAdminAuth,
  getStoredAdminAuth,
  verifyAdminAccess,
} from "@/lib/admin-auth";
import { showDeleteToast } from "@/lib/toast-utils";

import "react-toastify/dist/ReactToastify.css";

import styles from "./sales-service-view.module.css";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

async function requestSalesServiceRequests() {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/sales-service/`, {
    cache: "no-store",
  });
  const data = await response.json().catch(() => []);

  if (!response.ok) {
    throw new Error(data.error || "Failed to fetch request details.");
  }

  return Array.isArray(data) ? data : [];
}

async function removeSalesServiceRequest(id) {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/sales-service/${id}/`, {
    method: "DELETE",
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Failed to delete request.");
  }

  return data;
}

function resolveClientImageUrl(clientImage) {
  const rawValue = String(clientImage || "").trim();

  if (!rawValue) {
    return "";
  }

  if (/^https?:\/\//i.test(rawValue)) {
    return rawValue;
  }

  if (rawValue.startsWith("/")) {
    return `${API_BASE_URL}${rawValue}`;
  }

  const normalisedPath = rawValue.startsWith("media/") ? rawValue : `media/${rawValue}`;
  return `${API_BASE_URL}/${normalisedPath}`;
}

function renderDetailLine(label, value) {
  return (
    <div className={styles.stackLine}>
      <span className={styles.stackLabel}>{label}</span>
      <span className={styles.stackValue}>{value || "-"}</span>
    </div>
  );
}

function formatModeOfContact(modeOfContact) {
  if (modeOfContact === "phone") {
    return "Phone";
  }

  if (modeOfContact === "email") {
    return "Email";
  }

  return "-";
}

function formatRfqType(rfqType) {
  if (rfqType === "workshop") {
    return "Workshop";
  }

  if (rfqType === "spare") {
    return "Spare";
  }

  if (rfqType === "onsite") {
    return "Onsite";
  }

  return "-";
}

function formatRfqCategory(rfqCategory) {
  if (rfqCategory === "standard") {
    return "Standard";
  }

  if (rfqCategory === "quote_of_assessment") {
    return "Quote of assessment";
  }

  if (rfqCategory === "quote_of_completion") {
    return "Quote of completion";
  }

  return "-";
}

function formatSalesExecutive(salesExecutive) {
  if (salesExecutive === "sales_executive_1") {
    return "Sales Executive 1";
  }

  if (salesExecutive === "sales_executive_2") {
    return "Sales Executive 2";
  }

  if (salesExecutive === "sales_executive_3") {
    return "Sales Executive 3";
  }

  return "-";
}

function formatBatteryServices(batteryServices) {
  return Array.isArray(batteryServices) && batteryServices.length
    ? batteryServices.join(", ")
    : "-";
}

function formatRequestSummary(requestItem) {
  const batteryServices = formatBatteryServices(requestItem.batteryServices);

  if (batteryServices !== "-") {
    return batteryServices;
  }

  if (requestItem.itemName || requestItem.quantity || requestItem.unit) {
    return `${requestItem.itemName || "-"} (${requestItem.quantity || 0} ${requestItem.unit || ""})`.trim();
  }

  return "-";
}

function formatPlanningType(planningType) {
  if (planningType === "verbal") {
    return "Verbal";
  }

  if (planningType === "quote_after") {
    return "Quote after";
  }

  if (planningType === "quote_as_per_request") {
    return "Quote as per request";
  }

  return "Not planned";
}

function formatPlanningSchedule(planStartDate, planEndDate) {
  if (planStartDate && planEndDate) {
    return `${planStartDate} to ${planEndDate}`;
  }

  return planStartDate || planEndDate || "-";
}

function hasPlanningDetails(requestItem) {
  return Boolean(
    requestItem.planningType ||
      requestItem.planStartDate ||
      requestItem.planEndDate ||
      requestItem.planningRemarks,
  );
}

function isRequestWorkflowLocked(requestItem) {
  return Boolean(requestItem?.hasCostEstimation || requestItem?.hasQuotation);
}

export default function SalesServiceViewPage() {
  const router = useRouter();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [requests, setRequests] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

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
    setIsLoading(true);
    setErrorMessage("");

    requestSalesServiceRequests()
      .then((data) => {
        if (isMounted) {
          setRequests(data);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setErrorMessage(error.message || "Failed to load request details.");
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

  const handleDelete = async (requestItem) => {
    if (isRequestWorkflowLocked(requestItem)) {
      const message = "This RFQ is already used in workflow and cannot be deleted.";
      setErrorMessage(message);
      toast.error(message);
      return;
    }

    const shouldDelete = window.confirm(
      `Delete ${requestItem.referenceNo || "this request"}?`,
    );

    if (!shouldDelete) {
      return;
    }

    setDeletingId(requestItem.id);
    setErrorMessage("");

    try {
      await removeSalesServiceRequest(requestItem.id);
      setRequests((currentRequests) =>
        currentRequests.filter((currentRequest) => currentRequest.id !== requestItem.id),
      );
      showDeleteToast("Request deleted successfully");
    } catch (error) {
      setErrorMessage(error.message || "Failed to delete request.");
      toast.error(error.message || "Failed to delete request.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleEdit = (requestItem) => {
    if (isRequestWorkflowLocked(requestItem)) {
      const message = "This RFQ is already used in workflow and cannot be edited.";
      setErrorMessage(message);
      toast.error(message);
      return;
    }

    router.push(`/sales-service?requestId=${requestItem.id}`);
  };

  const handleViewAttachment = (requestItem) => {
    const pdfUrl = resolveClientImageUrl(requestItem.clientImage);

    if (!pdfUrl) {
      return;
    }

    window.open(pdfUrl, "_blank", "noopener,noreferrer");
  };

  if (isCheckingAuth || !isAuthorized) {
    return null;
  }

  return (
    <main className={styles.contentArea}>
      <section className={styles.card}>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Request for quotation List</h1>
          </div>

          <div className={styles.headerActions}>
            <button
              type="button"
              className={`${styles.iconButton} ${styles.addButton}`}
              onClick={() => router.push("/sales-service")}
              aria-label="Add request"
              title="Add request"
            >
              <FaPlus />
            </button>
          </div>
        </div>

        {errorMessage ? <div className={styles.errorBanner}>{errorMessage}</div> : null}

        <div className={styles.tableSummary}>
          <span>{requests.length} requests found</span>
        </div>

        <div className={styles.tableShell}>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Ref no</th>
                  <th>Client details</th>
                  <th>Company</th>
                  <th>Reference details</th>
                  <th>Service details</th>
                  <th>Planning</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan="8" className={styles.emptyState}>
                      Loading request details...
                    </td>
                  </tr>
                ) : requests.length ? (
                  requests.map((requestItem, index) => (
                    <tr key={requestItem.id}>
                      <td>{index + 1}</td>
                      <td>{requestItem.referenceNo || "-"}</td>
                      <td>
                        <div className={styles.stackCell}>
                          {renderDetailLine("Client", requestItem.clientName)}
                          {renderDetailLine("Mode", formatModeOfContact(requestItem.modeOfContact))}
                          {requestItem.modeOfContact === "email"
                            ? renderDetailLine("Email", requestItem.email)
                            : renderDetailLine("Phone", requestItem.phoneNo)}
                        </div>
                      </td>
                      <td>{requestItem.companyName || "-"}</td>
                      <td>
                        <div className={styles.stackCell}>
                          {renderDetailLine("Date", requestItem.requestDate)}
                          {renderDetailLine("RFQ type", formatRfqType(requestItem.rfqType))}
                          {renderDetailLine(
                            "Category",
                            formatRfqCategory(requestItem.rfqCategory),
                          )}
                          {renderDetailLine(
                            "Sales exec",
                            formatSalesExecutive(requestItem.salesExecutive),
                          )}
                          {requestItem.emailReferenceNumber
                            ? renderDetailLine("Email ref", requestItem.emailReferenceNumber)
                            : renderDetailLine("Contact", formatModeOfContact(requestItem.modeOfContact))}
                        </div>
                      </td>
                      <td>
                        <div className={styles.stackCell}>
                          {renderDetailLine(
                            "Services",
                            formatRequestSummary(requestItem),
                          )}
                          {renderDetailLine(
                            "Scope",
                            requestItem.scopeArea ||
                              formatBatteryServices(requestItem.batteryServices),
                          )}
                        </div>
                      </td>
                      <td>
                        <div className={styles.stackCell}>
                          <span
                            className={`${styles.planningBadge} ${
                              hasPlanningDetails(requestItem)
                                ? styles.planningReady
                                : styles.planningPending
                            }`}
                          >
                            {formatPlanningType(requestItem.planningType)}
                          </span>
                          {renderDetailLine(
                            "Schedule",
                            formatPlanningSchedule(
                              requestItem.planStartDate,
                              requestItem.planEndDate,
                            ),
                          )}
                          {renderDetailLine("Remarks", requestItem.planningRemarks)}
                          {renderDetailLine(
                            "Workflow",
                            requestItem.hasPurchaseOrder
                              ? `Job card ready (${requestItem.purchaseOrderNo || "-"})`
                              : requestItem.hasQuotation
                                ? "Quotation created"
                                : requestItem.hasCostEstimation
                                  ? "Cost estimation created"
                                  : "Draft RFQ",
                          )}
                        </div>
                      </td>
                      <td>
                        <div className={styles.actionGroup}>
                          <button
                            type="button"
                            className={`${styles.actionButton} ${styles.pdfAction}`}
                            onClick={() => handleViewAttachment(requestItem)}
                            disabled={!requestItem.clientImage}
                            title={
                              requestItem.clientImage
                                ? "View attachment"
                                : "Attachment not available"
                            }
                            aria-label={
                              requestItem.clientImage
                                ? "View request attachment"
                                : "Attachment not available"
                            }
                          >
                            <FaEye />
                          </button>
                          <button
                            type="button"
                            className={`${styles.actionButton} ${styles.editAction}`}
                            onClick={() => handleEdit(requestItem)}
                            disabled={isRequestWorkflowLocked(requestItem)}
                            title={
                              isRequestWorkflowLocked(requestItem)
                                ? "Already used in workflow"
                                : "Edit request"
                            }
                          >
                            <FaEdit />
                          </button>
                          <button
                            type="button"
                            className={`${styles.actionButton} ${styles.deleteAction}`}
                            onClick={() => handleDelete(requestItem)}
                            disabled={
                              deletingId === requestItem.id ||
                              isRequestWorkflowLocked(requestItem)
                            }
                            title={
                              isRequestWorkflowLocked(requestItem)
                                ? "Already used in workflow"
                                : "Delete request"
                            }
                          >
                            <FaTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" className={styles.emptyState}>
                      No request details found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <ToastContainer position="top-right" autoClose={3000} />
    </main>
  );
}
