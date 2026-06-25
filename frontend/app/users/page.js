"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FaEdit, FaTrash } from "react-icons/fa";
import { ToastContainer, toast } from "react-toastify";

import "react-toastify/dist/ReactToastify.css";

import {
  clearStoredAdminAuth,
  fetchWithAdminAuth,
  getStoredAdminAuth,
  verifyAdminAccess,
} from "@/lib/admin-auth";

import styles from "./users.module.css";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

const INITIAL_USER_FORM = {
  id: "",
  username: "",
  password: "",
  role: "",
  isActive: true,
};

const AVAILABLE_ROLES = [
  { value: "admin", label: "Admin" },
  { value: "sales_executive", label: "Sales Executive" },
  { value: "lead_sales", label: "Lead Sales" },
  { value: "hod", label: "HOD" },
  { value: "md", label: "MD" },
  { value: "document_controller", label: "Document Controller" },
  { value: "operation_head", label: "Operation Head / Store Manager" },
  { value: "site_engineer", label: "Site Engineer" },
];

export default function UsersPage() {
  const router = useRouter();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [userForm, setUserForm] = useState(INITIAL_USER_FORM);
  const [editingUserId, setEditingUserId] = useState(null);

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
        // Additional check: make sure they are an admin
        const primaryRole = storedAuth.user?.primaryRole;
        if (primaryRole !== "admin" && !storedAuth.user?.isSuperuser) {
           throw new Error("Unauthorized");
        }

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

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/users/`, {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Failed to load users");
      }
      const data = await response.json();
      setUsers(data || []);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      fetchUsers();
    }
  }, [isAuthorized]);

  const handleFormChange = (event) => {
    const { name, value, type, checked } = event.target;
    setUserForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleEdit = (user) => {
    setEditingUserId(user.id);
    setUserForm({
      id: user.id,
      username: user.username,
      password: "", // Keep blank so we only update if typed
      role: user.primaryRole || "",
      isActive: user.isActive !== undefined ? user.isActive : true, // Wait, backend doesn't return isActive in payload currently. Let's assume true for now, but backend should ideally return it. 
      // I'll update the backend to return isActive in _build_admin_user_payload.
    });
  };

  const handleCancel = () => {
    setEditingUserId(null);
    setUserForm(INITIAL_USER_FORM);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this user?")) {
      return;
    }

    try {
      const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/users/${id}/`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to delete user");
      }
      toast.success("User deleted successfully.");
      fetchUsers();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!userForm.username || !userForm.role) {
      toast.error("Username and Role are required.");
      return;
    }

    if (!editingUserId && !userForm.password) {
      toast.error("Password is required for new users.");
      return;
    }

    setIsSaving(true);
    try {
      const url = editingUserId 
        ? `${API_BASE_URL}/api/users/${editingUserId}/`
        : `${API_BASE_URL}/api/users/`;
        
      const response = await fetchWithAdminAuth(url, {
        method: editingUserId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: userForm.username,
          password: userForm.password,
          role: userForm.role,
          isActive: userForm.isActive,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to save user");
      }

      toast.success(editingUserId ? "User updated successfully." : "User created successfully.");
      setEditingUserId(null);
      setUserForm(INITIAL_USER_FORM);
      fetchUsers();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsSaving(false);
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
            <h1 className={styles.pageTitle}>User Access Control</h1>
          </div>

          <form onSubmit={handleSubmit}>
            <div className={styles.formGrid}>
              <div className={styles.fieldGroup}>
                <label htmlFor="username">Username</label>
                <input
                  id="username"
                  name="username"
                  value={userForm.username}
                  onChange={handleFormChange}
                  placeholder="Enter username"
                  autoComplete="off"
                />
              </div>

              <div className={styles.fieldGroup}>
                <label htmlFor="password">Password {editingUserId && "(Leave blank to keep current)"}</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  value={userForm.password}
                  onChange={handleFormChange}
                  placeholder="Enter password"
                  autoComplete="new-password"
                />
              </div>

              <div className={styles.fieldGroup}>
                <label htmlFor="role">Role</label>
                <select
                  id="role"
                  name="role"
                  value={userForm.role}
                  onChange={handleFormChange}
                >
                  <option value="">Select Role</option>
                  {AVAILABLE_ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.fieldGroup} style={{ flexDirection: 'row', alignItems: 'center', height: '38px' }}>
                <input
                  id="isActive"
                  name="isActive"
                  type="checkbox"
                  checked={userForm.isActive}
                  onChange={handleFormChange}
                  style={{ width: '16px', height: '16px' }}
                />
                <label htmlFor="isActive" style={{ marginLeft: '8px', cursor: 'pointer' }}>Active Account</label>
              </div>

              <div className={styles.fieldGroup} style={{ flexDirection: 'row', gap: '8px' }}>
                <button type="submit" className={styles.addButton} disabled={isSaving}>
                  {isSaving ? "Saving..." : editingUserId ? "UPDATE USER" : "ADD USER"}
                </button>
                {editingUserId && (
                  <button type="button" className={styles.cancelButton} onClick={handleCancel} disabled={isSaving}>
                    CANCEL
                  </button>
                )}
              </div>
            </div>
          </form>

          <div className={styles.tableShell}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Primary Role</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan="4" className={styles.emptyRow}>Loading users...</td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan="4" className={styles.emptyRow}>No users found.</td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.username} {user.isSuperuser && "(Superuser)"}</td>
                      <td>
                        {AVAILABLE_ROLES.find(r => r.value === user.primaryRole)?.label || user.primaryRole || "N/A"}
                      </td>
                      <td>
                        <span className={`${styles.badge} ${user.isActive === false ? styles.inactive : styles.active}`}>
                          {user.isActive === false ? "Inactive" : "Active"}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button
                            type="button"
                            className={`${styles.actionButton} ${styles.edit}`}
                            onClick={() => handleEdit(user)}
                            title="Edit User"
                          >
                            <FaEdit />
                          </button>
                          {!user.isSuperuser && (
                            <button
                              type="button"
                              className={`${styles.actionButton} ${styles.delete}`}
                              onClick={() => handleDelete(user.id)}
                              title="Delete User"
                            >
                              <FaTrash />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      <ToastContainer position="top-right" autoClose={3000} />
    </>
  );
}
