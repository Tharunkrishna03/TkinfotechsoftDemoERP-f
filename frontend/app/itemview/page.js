"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FaAngleLeft,
  FaAngleRight,
  FaEdit,
  FaImage,
  FaPlus,
  
  FaTimes,
  FaTrash,
} from "react-icons/fa";

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
import { ToastContainer, toast } from "react-toastify";

import "react-toastify/dist/ReactToastify.css";

import styles from "./itemview.module.css";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

async function requestItemFolders() {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/itemfolder/`, {
    cache: "no-store",
  });
  const data = await response.json().catch(() => []);

  if (!response.ok) {
    throw new Error(data.error || "Failed to fetch items.");
  }

  return Array.isArray(data) ? data : [];
}

async function updateItemFolder(id, payload) {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/itemfolder/${id}/`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Failed to update item.");
  }

  return data;
}

async function removeItemFolder(id) {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/itemfolder/${id}/`, {
    method: "DELETE",
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Failed to delete item.");
  }

  return data;
}

function getImageUrl(path) {
  if (!path) {
    return "";
  }

  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  return `${API_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

function formatAmount(value) {
  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) ? amount.toFixed(2) : "0.00";
}

export default function ItemView() {
  const router = useRouter();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [items, setItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusUpdatingId, setStatusUpdatingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedItemType, setSelectedItemType] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0]);
  const [currentPage, setCurrentPage] = useState(1);
  const [previewImage, setPreviewImage] = useState(null);

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

    requestItemFolders()
      .then((data) => {
        if (isMounted) {
          setItems(data);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setErrorMessage(error.message || "Failed to load items.");
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

  const uniqueItemTypes = Array.from(
    new Set(items.map((item) => item.itemType).filter(Boolean)),
  );
  const uniqueCategories = Array.from(
    new Set(items.map((item) => item.categoryName).filter(Boolean)),
  );
  const uniqueGroups = Array.from(
    new Set(items.map((item) => item.itemGroup).filter(Boolean)),
  );

  const normalizedSearch = searchValue.trim().toLowerCase();
  const filteredItems = items.filter((item) => {
    if (selectedItemType && item.itemType !== selectedItemType) {
      return false;
    }

    if (selectedCategory && item.categoryName !== selectedCategory) {
      return false;
    }

    if (selectedGroup && item.itemGroup !== selectedGroup) {
      return false;
    }

    if (!matchesSelectedMonth(item.created_at, selectedMonth)) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    return [
      item.itemCode,
      item.itemName,
      item.partNo,
      item.hsnCode,
      item.itemType,
      item.categoryName,
      item.itemGroup,
    ].some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
  });

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  useEffect(() => {
    if (currentPage !== safeCurrentPage) {
      setCurrentPage(safeCurrentPage);
    }
  }, [currentPage, safeCurrentPage]);

  const startIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedItems = filteredItems.slice(startIndex, startIndex + pageSize);

  const pageNumbers =
    totalPages <= 5
      ? Array.from({ length: totalPages }, (_, index) => index + 1)
      : safeCurrentPage <= 3
        ? [1, 2, 3, 4, 5]
        : safeCurrentPage >= totalPages - 2
          ? [
              totalPages - 4,
              totalPages - 3,
              totalPages - 2,
              totalPages - 1,
              totalPages,
            ]
          : [
              safeCurrentPage - 2,
              safeCurrentPage - 1,
              safeCurrentPage,
              safeCurrentPage + 1,
              safeCurrentPage + 2,
            ];


  const handleToggleStatus = async (item) => {
    setStatusUpdatingId(item.id);
    setErrorMessage("");

    try {
      const updatedItem = await updateItemFolder(item.id, {
        isActive: !item.isActive,
      });
      setItems((currentItems) =>
        currentItems.map((currentItem) =>
          currentItem.id === item.id ? { ...currentItem, ...updatedItem } : currentItem,
        ),
      );
      toast.success("Item updated successfully");
    } catch (error) {
      setErrorMessage(error.message || "Failed to update item status.");
      toast.error(error.message || "Failed to update item status.");
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const handleDelete = async (item) => {
    const shouldDelete = window.confirm(
      `Delete ${item.itemName || item.itemCode || "this item"}?`,
    );

    if (!shouldDelete) {
      return;
    }

    setDeletingId(item.id);
    setErrorMessage("");

    try {
      await removeItemFolder(item.id);
      setItems((currentItems) =>
        currentItems.filter((currentItem) => currentItem.id !== item.id),
      );
      showDeleteToast("Item deleted successfully");
    } catch (error) {
      setErrorMessage(error.message || "Failed to delete item.");
      toast.error(error.message || "Failed to delete item.");
    } finally {
      setDeletingId(null);
    }
  };

  const openImagePreview = (item) => {
    const imageUrl = getImageUrl(item.itemImage);
    if (!imageUrl) {
      return;
    }

    setPreviewImage({
      src: imageUrl,
      title: item.itemName || item.itemCode || "Item image",
    });
  };

  const handleEdit = (item) => {
    router.push(`/item?itemId=${item.id}`);
  };

  if (isCheckingAuth || !isAuthorized) {
    return null;
  }

  return (
    <>
      <main className={styles.contentArea}>
          <section className={styles.card}>
            <div className={styles.header}>
              <div>
                <h1 className={styles.title}>Item List</h1>
                <p className={styles.subtitle}>
                  View, search, and update item status from one place.
                </p>
              </div>

              <div className={styles.headerActions}>
                <button
                  type="button"
                  className={`${styles.iconButton} ${styles.addButton}`}
                  onClick={() => router.push("/item")}
                  aria-label="Add item"
                  title="Add item"
                >
                  <FaPlus />
                </button>
                
              </div>
            </div>

            <div className={styles.filtersSection}>
              <div className={styles.filterGrid}>
                <select
                  className={styles.filterControl}
                  value={selectedItemType}
                  onChange={(event) => {
                    setSelectedItemType(event.target.value);
                    setCurrentPage(1);
                  }}
                >
                  <option value="">Choose Item Type</option>
                  {uniqueItemTypes.map((itemType) => (
                    <option key={itemType} value={itemType}>
                      {itemType}
                    </option>
                  ))}
                </select>

                <select
                  className={styles.filterControl}
                  value={selectedCategory}
                  onChange={(event) => {
                    setSelectedCategory(event.target.value);
                    setCurrentPage(1);
                  }}
                >
                  <option value="">Choose Item Category</option>
                  {uniqueCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>

                <select
                  className={styles.filterControl}
                  value={selectedGroup}
                  onChange={(event) => {
                    setSelectedGroup(event.target.value);
                    setCurrentPage(1);
                  }}
                >
                  <option value="">Choose Item Group</option>
                  {uniqueGroups.map((group) => (
                    <option key={group} value={group}>
                      {group}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.secondaryToolbar}>
                <select
                  className={styles.pageSizeControl}
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

                <select
                  className={styles.monthFilterControl}
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
              </div>
            </div>

            {errorMessage ? (
              <div className={styles.errorBanner}>{errorMessage}</div>
            ) : null}

            <div className={styles.tableSummary}>
              <span>{filteredItems.length} items found</span>
            </div>

            <div className={styles.tableShell}>
              <div className={styles.tableWrapper}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Item Code</th>
                      <th>Item Name</th>
                      <th>Item Type</th>
                      <th>Item Category</th>
                      <th>Item Group</th>
                      <th>Purchase Rate</th>
                      <th>Sales Rate</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr>
                        <td colSpan="10" className={styles.emptyState}>
                          Loading items...
                        </td>
                      </tr>
                    ) : paginatedItems.length ? (
                      paginatedItems.map((item, index) => (
                        <tr key={item.id}>
                          <td>{startIndex + index + 1}</td>
                          <td>{item.itemCode || "-"}</td>
                          <td>{item.itemName || "-"}</td>
                          <td>{item.itemType || "-"}</td>
                          <td>{item.categoryName || "-"}</td>
                          <td>{item.itemGroup || "-"}</td>
                          <td className={styles.amountCell}>
                            {formatAmount(item.purchasePrice)}
                          </td>
                          <td className={styles.amountCell}>
                            {formatAmount(item.salesPrice)}
                          </td>
                          <td>
                            <button
                              type="button"
                              className={`${styles.statusButton} ${
                                item.isActive ? styles.statusActive : styles.statusInactive
                              }`}
                              onClick={() => handleToggleStatus(item)}
                              disabled={statusUpdatingId === item.id}
                            >
                              {statusUpdatingId === item.id
                                ? "UPDATING"
                                : item.isActive
                                  ? "ACTIVE"
                                  : "DEACTIVE"}
                            </button>
                          </td>
                          <td>
                            <div className={styles.actionGroup}>
                              <button
                                type="button"
                                className={`${styles.actionButton} ${styles.editAction}`}
                                onClick={() => handleEdit(item)}
                                title="Edit item"
                              >
                                <FaEdit />
                              </button>
                              <button
                                type="button"
                                className={`${styles.actionButton} ${styles.deleteAction}`}
                                onClick={() => handleDelete(item)}
                                disabled={deletingId === item.id}
                                title="Delete item"
                              >
                                <FaTrash />
                              </button>
                              <button
                                type="button"
                                className={`${styles.actionButton} ${styles.imageAction}`}
                                onClick={() => openImagePreview(item)}
                                disabled={!item.itemImage}
                                title={
                                  item.itemImage ? "View item image" : "No item image available"
                                }
                              >
                                <FaImage />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="10" className={styles.emptyState}>
                          No items match your filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={styles.pagination}>
              <button
                type="button"
                className={styles.paginationButton}
                onClick={() => setCurrentPage(1)}
                disabled={safeCurrentPage === 1}
              >
                FIRST
              </button>
              <button
                type="button"
                className={styles.paginationIconButton}
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={safeCurrentPage === 1}
                aria-label="Previous page"
              >
                <FaAngleLeft />
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
                className={styles.paginationIconButton}
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={safeCurrentPage === totalPages}
                aria-label="Next page"
              >
                <FaAngleRight />
              </button>
              <button
                type="button"
                className={styles.paginationButton}
                onClick={() => setCurrentPage(totalPages)}
                disabled={safeCurrentPage === totalPages}
              >
                LAST
              </button>
            </div>
          </section>
      </main>

      {previewImage ? (
        <div
          className={styles.modalBackdrop}
          onClick={() => setPreviewImage(null)}
          role="presentation"
        >
          <div
            className={styles.modalCard}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Item image preview"
          >
            <button
              type="button"
              className={styles.modalCloseButton}
              onClick={() => setPreviewImage(null)}
              aria-label="Close image popup"
            >
              <FaTimes />
            </button>

            <div className={styles.modalContent}>
              <p className={styles.modalTitle}>{previewImage.title}</p>
              <img
                src={previewImage.src}
                alt={previewImage.title}
                className={styles.previewImage}
              />
            </div>
          </div>
        </div>
      ) : null}

      <ToastContainer position="top-right" autoClose={3000} />
    </>
  );
}
