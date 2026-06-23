"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FaBoxOpen,
  FaBoxes,
  FaEdit,
  FaLayerGroup,
  FaList,
  FaTimes,
  FaTrash,
} from "react-icons/fa";
import { ToastContainer, toast } from "react-toastify";

import "react-toastify/dist/ReactToastify.css";

import {
  clearStoredAdminAuth,
  fetchWithAdminAuth,
  getStoredAdminAuth,
  verifyAdminAccess,
} from "@/lib/admin-auth";

import styles from "./stock.module.css";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

function getTodayValue() {
  const today = new Date();
  const day = String(today.getDate()).padStart(2, "0");
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const year = today.getFullYear();
  return `${day}-${month}-${year}`;
}

const INITIAL_ITEM_FORM = {
  itemId: "",
  itemCode: "",
  itemName: "",
  unit: "",
  quantity: "",
};

function normaliseOpeningRows(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .filter((row) => row?.itemCode || row?.itemName)
    .map((row, index) => ({
      id: row?.id || `${row?.itemId || row?.itemCode || "row"}-${index}`,
      itemId: row?.itemId ? String(row.itemId) : "",
      itemCode: row?.itemCode || "",
      itemName: row?.itemName || "",
      unit: row?.unit || "",
      quantity: Number(row?.quantity) || 0,
    }));
}

export default function StockPage() {
  const router = useRouter();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isQuickLinksOpen, setIsQuickLinksOpen] = useState(true);
  const [stockItems, setStockItems] = useState([]);
  const [isItemsLoading, setIsItemsLoading] = useState(true);
  const [isSavingOpeningStock, setIsSavingOpeningStock] = useState(false);
  const [itemForm, setItemForm] = useState(INITIAL_ITEM_FORM);
  const [openingRows, setOpeningRows] = useState([]);
  const [editingRowId, setEditingRowId] = useState(null);
  const [openingHeader, setOpeningHeader] = useState({
    date: getTodayValue(),
    code: "    ",
  });

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

    const fetchStockData = async () => {
      setIsItemsLoading(true);

      try {
        const [itemsResponse, openingStockResponse] = await Promise.all([
          fetchWithAdminAuth(`${API_BASE_URL}/api/itemfolder/`, {
            cache: "no-store",
          }),
          fetchWithAdminAuth(`${API_BASE_URL}/api/opening-stock/`, {
            cache: "no-store",
          }),
        ]);
        const itemsData = await itemsResponse.json().catch(() => []);
        const openingStockData = await openingStockResponse.json().catch(() => ({}));

        if (!itemsResponse.ok) {
          throw new Error("Failed to load item data.");
        }

        if (isMounted) {
          const nextItems = Array.isArray(itemsData)
            ? itemsData
                .filter((item) => item?.itemCode || item?.itemName)
                .sort((firstItem, secondItem) =>
                  String(firstItem.itemName || firstItem.itemCode).localeCompare(
                    String(secondItem.itemName || secondItem.itemCode),
                  ),
                )
            : [];

          setStockItems(nextItems);

          if (openingStockResponse.ok) {
            setOpeningHeader({
              date: openingStockData?.header?.date || getTodayValue(),
              code: openingStockData?.header?.code || "    ",
            });
            setOpeningRows(normaliseOpeningRows(openingStockData?.rows));
          }
        }
      } catch {
        if (isMounted) {
          setStockItems([]);
        }
      } finally {
        if (isMounted) {
          setIsItemsLoading(false);
        }
      }
    };

    fetchStockData();

    return () => {
      isMounted = false;
    };
  }, [isAuthorized]);

  const handleHeaderChange = (event) => {
    const { name, value } = event.target;
    setOpeningHeader((currentValue) => ({
      ...currentValue,
      [name]: value,
    }));
  };

  const buildItemFormFromSelection = (item, quantity = "") => ({
    itemId: item ? String(item.id) : "",
    itemCode: item?.itemCode || "",
    itemName: item?.itemName || "",
    unit: item?.unit || "",
    quantity,
  });

  const selectedItem = stockItems.find(
    (item) => String(item.id) === itemForm.itemId,
  );
  const dropdownItems = stockItems.filter((item) => {
    const itemRows = openingRows.filter(
      (row) => String(row.itemId) === String(item.id),
    );

    if (itemRows.length === 0) {
      return true;
    }

    if (editingRowId && itemRows.some((row) => row.id === editingRowId)) {
      return true;
    }

    const allocatedQuantity = itemRows.reduce(
      (total, row) => total + (Number(row.quantity) || 0),
      0,
    );
    const itemQuantity = Number(item?.minimumStockQty) || 0;

    return itemQuantity - allocatedQuantity > 0;
  });
  const reservedQuantity = openingRows.reduce((total, row) => {
    if (row.id === editingRowId || String(row.itemId) !== itemForm.itemId) {
      return total;
    }

    return total + (Number(row.quantity) || 0);
  }, 0);
  const enteredQuantity = Number(itemForm.quantity) || 0;
  const actualQuantity = Number(selectedItem?.minimumStockQty) || 0;
  const remainingQuantityBeforeEntry = actualQuantity - reservedQuantity;
  const availableQuantity = Math.max(
    remainingQuantityBeforeEntry - enteredQuantity,
    0,
  );

  const handleItemCodeChange = (event) => {
    const selectedId = event.target.value;
    const item = stockItems.find((currentItem) => String(currentItem.id) === selectedId);

    setItemForm((currentValue) =>
      buildItemFormFromSelection(item, currentValue.quantity),
    );
  };

  const handleItemNameChange = (event) => {
    const selectedId = event.target.value;
    const item = stockItems.find((currentItem) => String(currentItem.id) === selectedId);

    setItemForm((currentValue) =>
      buildItemFormFromSelection(item, currentValue.quantity),
    );
  };

  const handleItemFormChange = (event) => {
    const { name, value } = event.target;

    if (name === "quantity" && value && !/^\d*\.?\d*$/.test(value)) {
      return;
    }

    setItemForm((currentValue) => ({
      ...currentValue,
      [name]: value,
    }));
  };

  const handleAddRow = () => {
    const quantityValue = Number(itemForm.quantity);
    const isSameOpeningItem = (row) =>
      String(row.itemId || "") === String(itemForm.itemId || "") &&
      String(row.itemCode || "") === String(itemForm.itemCode || "");

    if (!itemForm.itemId || !Number.isFinite(quantityValue) || quantityValue <= 0) {
      toast.error("Please select an item and enter a valid quantity.");
      return;
    }

    if (quantityValue > remainingQuantityBeforeEntry) {
      toast.error(
        `Available quantity is only ${remainingQuantityBeforeEntry}. Please enter a lower quantity.`,
      );
      return;
    }

    if (editingRowId) {
      setOpeningRows((currentRows) => {
        const duplicateRow = currentRows.find(
          (row) => row.id !== editingRowId && isSameOpeningItem(row),
        );

        if (duplicateRow) {
          return currentRows.reduce((nextRows, row) => {
            if (row.id === editingRowId) {
              return nextRows;
            }

            if (row.id === duplicateRow.id) {
              nextRows.push({
                ...row,
                itemId: itemForm.itemId,
                itemCode: itemForm.itemCode,
                itemName: itemForm.itemName,
                unit: itemForm.unit,
                quantity: (Number(row.quantity) || 0) + quantityValue,
              });
              return nextRows;
            }

            nextRows.push(row);
            return nextRows;
          }, []);
        }

        return currentRows.map((row) =>
          row.id === editingRowId
            ? {
                ...row,
                itemId: itemForm.itemId,
                itemCode: itemForm.itemCode,
                itemName: itemForm.itemName,
                unit: itemForm.unit,
                quantity: quantityValue,
              }
            : row,
        );
      });
      setEditingRowId(null);
    } else {
      setOpeningRows((currentRows) => {
        const existingRow = currentRows.find(isSameOpeningItem);

        if (existingRow) {
          return currentRows.map((row) =>
            row.id === existingRow.id
              ? {
                  ...row,
                  itemId: itemForm.itemId,
                  itemCode: itemForm.itemCode,
                  itemName: itemForm.itemName,
                  unit: itemForm.unit,
                  quantity: (Number(row.quantity) || 0) + quantityValue,
                }
              : row,
          );
        }

        return [
          ...currentRows,
          {
            id: Date.now(),
            itemId: itemForm.itemId,
            ...itemForm,
            quantity: quantityValue,
          },
        ];
      });
    }

    setItemForm((currentValue) => ({
      ...currentValue,
      quantity: "",
    }));
  };

  const handleCancel = () => {
    setItemForm(INITIAL_ITEM_FORM);
    setOpeningRows([]);
    setEditingRowId(null);
  };

  const handleEditRow = (row) => {
    setEditingRowId(row.id);
    setItemForm({
      itemId: row.itemId,
      itemCode: row.itemCode,
      itemName: row.itemName,
      unit: row.unit,
      quantity: String(row.quantity),
    });
  };

  const handleDeleteRow = (rowId) => {
    setOpeningRows((currentRows) =>
      currentRows.filter((row) => row.id !== rowId),
    );

    if (editingRowId === rowId) {
      setEditingRowId(null);
      setItemForm(INITIAL_ITEM_FORM);
    }
  };

  const handleOpenOpeningStock = () => {
    setIsQuickLinksOpen(false);
  };

  const handleSubmit = async () => {
    const rowsToSave = openingRows.filter((row) => (Number(row.quantity) || 0) > 0);

    if (!rowsToSave.length) {
      toast.error("Add at least one opening stock item before submitting.");
      return;
    }

    setIsSavingOpeningStock(true);

    try {
      const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/opening-stock/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          header: openingHeader,
          rows: rowsToSave.map((row) => ({
            itemId: row.itemId,
            itemCode: row.itemCode,
            itemName: row.itemName,
            unit: row.unit,
            quantity: Number(row.quantity) || 0,
          })),
        }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.rows?.[0] || "Failed to save opening stock.");
      }

      setOpeningHeader({
        date: payload?.data?.header?.date || openingHeader.date,
        code: payload?.data?.header?.code || openingHeader.code,
      });
      setOpeningRows(normaliseOpeningRows(payload?.data?.rows));
      setEditingRowId(null);
      setItemForm(INITIAL_ITEM_FORM);
      toast.success("Opening stock saved successfully.");
    } catch (error) {
      toast.error(error.message || "Failed to save opening stock.");
    } finally {
      setIsSavingOpeningStock(false);
    }
  };

  if (isCheckingAuth || !isAuthorized) {
    return null;
  }

  return (
    <>
      <main className={styles.contentArea}>
          <section className={styles.card}>
            <div className={styles.pageTopRow}>
              <h1 className={styles.pageTitle}>New Opening</h1>

              <div className={styles.headerFieldRow}>
                <div className={styles.headerField}>
                  <label htmlFor="date">Date</label>
                  <input
                    id="date"
                    name="date"
                    value={openingHeader.date}
                    onChange={handleHeaderChange}
                  />
                </div>

                <div className={styles.headerField}>
                  <label htmlFor="code">Code</label>
                  <input
                    id="code"
                    name="code"
                    value={openingHeader.code}
                    onChange={handleHeaderChange}
                  />
                </div>
              </div>
            </div>

            <div className={styles.sectionBlock}>
              <div className={styles.sectionTitleRow}>
                <h2 className={styles.sectionTitle}>Item Details</h2>
              </div>

              <div className={styles.formGrid}>
                <div className={styles.fieldGroup}>
                  <label htmlFor="itemCode">Item Code</label>
                  <select
                    id="itemCode"
                    value={itemForm.itemId}
                    onChange={handleItemCodeChange}
                    disabled={isItemsLoading}
                  >
                    <option value="">
                      {isItemsLoading ? "Loading Item Code" : "Choose Item Code"}
                    </option>
                    {dropdownItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.itemCode}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.fieldGroup}>
                  <div className={styles.fieldLabelRow}>
                    <label htmlFor="itemName">Item Name</label>
                    <p className={styles.avlQtyText}>
                      <span>Avl.Qty:</span>
                      <strong>{availableQuantity}</strong>
                    </p>
                  </div>
                  <select
                    id="itemName"
                    value={itemForm.itemId}
                    onChange={handleItemNameChange}
                    disabled={isItemsLoading}
                  >
                    <option value="">
                      {isItemsLoading ? "Loading Item Name" : "Choose Item Name"}
                    </option>
                    {dropdownItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.itemName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.fieldGroup}>
                  <label htmlFor="unit">Unit</label>
                  <input
                    id="unit"
                    name="unit"
                    value={itemForm.unit}
                    readOnly
                  />
                </div>

                <div className={styles.fieldGroup}>
                  <label htmlFor="quantity">Quantity</label>
                  <input
                    id="quantity"
                    name="quantity"
                    type="number"
                    min="0"
                    step="any"
                    value={itemForm.quantity}
                    onChange={handleItemFormChange}
                  />
                </div>

                <div className={styles.addButtonWrap}>
                  <button
                    type="button"
                    className={styles.addButton}
                    onClick={handleAddRow}
                  >
                    {editingRowId ? "UPDATE" : "ADD"}
                  </button>
                </div>
              </div>
            </div>

            <div className={styles.tableShell}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Item Code</th>
                    <th>Item Name</th>
                    <th>Unit</th>
                    <th>Quantity</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {openingRows.length === 0 ? (
                    <tr>
                      <td colSpan="6" className={styles.emptyRow}>
                        No opening stock items added.
                      </td>
                    </tr>
                  ) : (
                    openingRows.map((row, index) => (
                      <tr key={row.id}>
                        <td>{index + 1}</td>
                        <td>{row.itemCode || "-"}</td>
                        <td>{row.itemName || "-"}</td>
                        <td>{row.unit || "-"}</td>
                        <td>{row.quantity ?? "-"}</td>
                        <td>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button
                              type="button"
                              onClick={() => handleEditRow(row)}
                              style={{
                                border: "none",
                                background: "#ffffff",
                                color: "#2563eb",
                                padding: "4px 8px",
                                borderRadius: "6px",
                                cursor: "pointer",
                              }}
                            >
                              <FaEdit />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteRow(row.id)}
                              style={{
                                border: "none",
                                background: "#ffffff",
                                color: "#ef4444",
                                padding: "4px 8px",
                                borderRadius: "6px",
                                cursor: "pointer",
                              }}
                            >
                              <FaTrash />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.submitButton}
                onClick={handleSubmit}
                disabled={isSavingOpeningStock}
              >
                {isSavingOpeningStock ? "Saving..." : "Submit"}
              </button>
              <button
                type="button"
                className={styles.cancelButton}
                onClick={handleCancel}
              >
                Cancel
              </button>
            </div>

            <div className={styles.noteRow}>
              <p className={styles.noteText}>
                <span>Note:</span> Fields marked with <strong>[ ]</strong> are
                mandatory.
              </p>
            </div>
          </section>
      </main>

      {isQuickLinksOpen ? (
        <div
          className={styles.quickLinksBackdrop}
          onClick={() => setIsQuickLinksOpen(false)}
          role="presentation"
        >
          <div
            className={styles.quickLinksCard}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Stock quick links"
          >
            <div className={styles.quickLinksHeader}>
              <h2>Stock - Quick Links</h2>
              <button
                type="button"
                className={styles.quickLinksClose}
                onClick={() => setIsQuickLinksOpen(false)}
                aria-label="Close quick links"
              >
                <FaTimes />
              </button>
            </div>

            <div className={styles.quickLinksGrid}>
              <button
                type="button"
                className={styles.quickLinkButton}
                onClick={handleOpenOpeningStock}
              >
                <span className={styles.quickLinkIcon}>
                  <FaBoxOpen />
                </span>
                <span>Opening Stock</span>
              </button>

              <button type="button" className={styles.quickLinkButton}>
                <span className={styles.quickLinkIcon}>
                  <FaList />
                </span>
                <span>Opening List</span>
              </button>

              <button type="button" className={styles.quickLinkButton}>
                <span className={styles.quickLinkIcon}>
                  <FaLayerGroup />
                </span>
                <span>Stock Allocation</span>
              </button>

              <button type="button" className={styles.quickLinkButton}>
                <span className={styles.quickLinkIcon}>
                  <FaBoxes />
                </span>
                <span>Stock List</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ToastContainer position="top-right" autoClose={3000} />
    </>
  );
}
