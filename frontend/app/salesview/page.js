"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { useRouter } from "next/navigation";
import { FaEdit, FaTrash, FaDownload, FaPlus } from "react-icons/fa";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import {
  clearStoredAdminAuth,
  getStoredAdminAuth,
  getStoredAdminToken,
  verifyAdminAccess,
} from "@/lib/admin-auth";
import { showDeleteToast } from "@/lib/toast-utils";

import styles from "./salesview.module.css";
import { ToastContainer, toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

const getAxiosAuthConfig = (config = {}) => {
  const token = getStoredAdminToken();
  return {
    ...config,
    headers: {
      ...(config.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
};

export default function SalesView() {
  const router = useRouter();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  const [items, setItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [editItemData, setEditItemData] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

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

  const fetchItems = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/items/`, getAxiosAuthConfig());
      setItems(res.data);
    } catch (err) {
      console.error("Failed to fetch items", err);
    }
  };

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    let isMounted = true;

    (async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/items/`, getAxiosAuthConfig());
        if (isMounted) {
          setItems(res.data);
        }
      } catch (err) {
        console.error("Failed to fetch items", err);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [isAuthorized]);

  const customers = [...new Set(items.map((item) => item.ledger).filter(Boolean))];

  const deleteItem = async (id) => {
    try {
      await axios.delete(
        `${API_BASE_URL}/delete-item/${id}/`,
        getAxiosAuthConfig(),
      );
      showDeleteToast("Item deleted successfully");
      fetchItems();
    } catch {
      toast.error("Failed to delete item");
    }
  };

  const openEditPopup = (item) => {
    setEditItemData(item);
    setIsEditing(false);
  };

  const closeEditPopup = () => setEditItemData(null);

  const handleEditChange = (e) => {
    const { name, value } = e.target;

    setEditItemData((prev) => {
      const nextItem = { ...prev, [name]: value };

      if (["quantity", "rate", "discount"].includes(name)) {
        const quantity = Number(nextItem.quantity) || 0;
        const rate = Number(nextItem.rate) || 0;
        const discount = Number(nextItem.discount) || 0;
        const gross = quantity * rate;
        const discountAmount = (gross * discount) / 100;
        nextItem.amount = (gross - discountAmount).toFixed(2);
      }

      return nextItem;
    });
  };

  const saveEdit = async () => {
    try {
      await axios.put(
        `${API_BASE_URL}/update-item/${editItemData.id}/`,
        editItemData,
        getAxiosAuthConfig(),
      );
      toast.success("Item updated successfully");
      fetchItems();
      closeEditPopup();
    } catch {
      toast.error("Failed to update item");
    }
  };

  const filteredItems = items.filter((item) => {
    return (
      (item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.item_code.toLowerCase().includes(searchTerm.toLowerCase())) &&
      (selectedCustomer ? item.ledger === selectedCustomer : true) &&
      (selectedMonth
        ? new Date(item.date).getMonth() + 1 === Number(selectedMonth)
        : true)
    );
  });

  const totalPages = Math.ceil(filteredItems.length / pageSize);
  const paginatedItems = filteredItems.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const downloadPDF = async () => {
    try {
      setIsPrinting(true);
      await new Promise((r) => setTimeout(r, 100));

      const element = document.getElementById("table-area");
      if (!element) {
        return;
      }

      const canvas = await html2canvas(element, { scale: 2 });
      const imgData = canvas.toDataURL("image/png");

      const pdf = new jsPDF("p", "mm", "a4");
      const imgWidth = 190;
      const pageHeight = 280;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 10, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save("SalesReport.pdf");
    } finally {
      setIsPrinting(false);
    }
  };

  if (isCheckingAuth || !isAuthorized) {
    return null;
  }

  return (
    <>
      <ToastContainer position="top-right" autoClose={3000} />
      <main className={styles.contentArea}>
        <div className={styles.card}>
          <h5 className={styles.title}>Invoice List</h5>

          <div className={styles.toolbar}>
            <div className={styles.filterGroup}>
              <input
                type="text"
                placeholder="Search..."
                className={`form-control ${styles.control}`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />

              <select
                className={`form-control ${styles.control}`}
                value={selectedCustomer}
                onChange={(e) => setSelectedCustomer(e.target.value)}
              >
                <option value="">All Customers</option>
                {customers.map((customer) => (
                  <option key={customer} value={customer}>
                    {customer}
                  </option>
                ))}
              </select>

              <select
                className={`form-control ${styles.control}`}
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              >
                <option value="">All Months</option>
                {[...Array(12)].map((_, i) => (
                  <option key={i} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>

              <select
                className={`form-control ${styles.compactControl}`}
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={30}>30</option>
              </select>
            </div>

            <div className={styles.headerButtons}>
              <button
                type="button"
                className={styles.addButton}
                onClick={() => router.push("/sales")}
              >
                <FaPlus /> Add
              </button>

              <button
                type="button"
                className={styles.secondaryButton}
                onClick={downloadPDF}
              >
                <FaDownload /> PDF
              </button>
            </div>
          </div>

          <div id="table-area" className={styles.tableShell}>
            <table className={`table table-bordered ${styles.table}`}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Item Code</th>
                  <th>Item Name</th>
                  <th>Unit</th>
                  <th>Quantity</th>
                  <th>Rate</th>
                  <th>Discount</th>
                  <th>Amount</th>
                  {!isPrinting && <th>Actions</th>}
                </tr>
              </thead>

              <tbody>
                {paginatedItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isPrinting ? 8 : 9}
                      style={{ textAlign: "center" }}
                    >
                      No items found
                    </td>
                  </tr>
                ) : (
                  paginatedItems.map((item, index) => (
                    <tr key={item.id}>
                      <td>{index + 1}</td>
                      <td>{item.item_code}</td>
                      <td>{item.item_name}</td>
                      <td>{item.unit}</td>
                      <td>{item.quantity}</td>
                      <td>{item.rate}</td>
                      <td>{item.discount}</td>
                      <td>{item.amount}</td>
                      {!isPrinting && (
                        <td>
                          <center>
                            <button
                              className={styles.edit}
                              onClick={() => openEditPopup(item)}
                            >
                              <FaEdit />
                            </button>
                            <button
                              className={styles.delete}
                              onClick={() => deleteItem(item.id)}
                            >
                              <FaTrash />
                            </button>
                          </center>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className={styles.paginationRow}>
            <button
              type="button"
              className={styles.pagerButton}
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}
            >
              Prev
            </button>

            <span className={styles.paginationInfo}>
              {currentPage} / {totalPages || 1}
            </span>

            <button
              type="button"
              className={styles.pagerButton}
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </main>

      {editItemData && (
        <div className={styles.overlay}>
          <div className={styles.modalBox}>
            <h4 style={{ textAlign: "center" }}>Invoice Preview</h4>

            {!isEditing ? (
              <>
                <p>
                  <b>Item Code:</b> {editItemData.item_code}
                </p>
                <p>
                  <b>Item Name:</b> {editItemData.item_name}
                </p>
                <p>
                  <b>Quantity:</b> {editItemData.quantity}
                </p>
                <p>
                  <b>Rate:</b> {editItemData.rate}
                </p>
                <p>
                  <b>Discount:</b> {editItemData.discount}
                </p>
                <p>
                  <b>Amount:</b> {editItemData.amount}
                </p>

                <div
                  style={{ display: "flex", gap: "10px", marginTop: "15px" }}
                >
                  <button
                    className="btn btn-primary"
                    onClick={() => setIsEditing(true)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={closeEditPopup}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                {[
                  "item_code",
                  "item_name",
                  "unit",
                  "quantity",
                  "rate",
                  "discount",
                  "amount",
                ].map((field) => (
                  <div key={field} className="mb-2">
                    <label>{field}</label>
                    <input
                      className="form-control"
                      name={field}
                      value={editItemData[field]}
                      onChange={handleEditChange}
                    />
                  </div>
                ))}

                <div
                  style={{ display: "flex", gap: "10px", marginTop: "10px" }}
                >
                  <button className="btn btn-success" onClick={saveEdit}>
                    Update
                  </button>
                  <button
                    className="btn btn-warning"
                    onClick={() => setIsEditing(false)}
                  >
                    Preview
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={closeEditPopup}
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
