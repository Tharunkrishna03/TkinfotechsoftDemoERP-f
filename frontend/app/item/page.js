"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FaThList } from "react-icons/fa";
import { ToastContainer, toast } from "react-toastify";

import "react-toastify/dist/ReactToastify.css";

import {
  clearStoredAdminAuth,
  fetchWithAdminAuth,
  getStoredAdminAuth,
  verifyAdminAccess,
} from "@/lib/admin-auth";

import styles from "./item.module.css";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

async function requestNextItemCode() {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/itemfolder/next-code/`, {
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Failed to load the next item code.");
  }

  return String(data?.itemCode || "").trim();
}

const INITIAL_FORM_STATE = {
  itemCode: "",
  unit: "",
  mrp: "",
  itemType: "",
  hsnCode: "",
  purchasePrice: "",
  itemName: "",
  tax: "",
  salesPrice: "",
  categoryName: "",
  partNo: "",
  minimumOrderQty: "",
  itemGroup: "",
  batchNo: "",
  minimumStockQty: "",
  itemDescription: "",
};

const INITIAL_TOGGLE_STATE = {
  isStock: false,
  needQc: false,
  needWarranty: false,
  isActive: true,
  needService: false,
  needSerialNo: false,
};

const MAX_ITEM_NAME_LENGTH = 100;
const MAX_PART_OR_BATCH_LENGTH = 20;
const MAX_DESCRIPTION_LENGTH = 250;

function ItemPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [formValues, setFormValues] = useState(INITIAL_FORM_STATE);
  const [toggles, setToggles] = useState(INITIAL_TOGGLE_STATE);
  const [itemImage, setItemImage] = useState(null);
  const editingItemId = searchParams.get("itemId");

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
    if (!isAuthorized || !editingItemId) {
      return;
    }

    let isMounted = true;

    const loadItemDetails = async () => {
      try {
        const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/itemfolder/${editingItemId}/`, {
          cache: "no-store",
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || "Failed to load item details.");
        }

        if (!isMounted) {
          return;
        }

        setFormValues({
          ...INITIAL_FORM_STATE,
          ...Object.fromEntries(
            Object.keys(INITIAL_FORM_STATE).map((key) => [key, data[key] ?? INITIAL_FORM_STATE[key]]),
          ),
        });
        setToggles({
          ...INITIAL_TOGGLE_STATE,
          ...Object.fromEntries(
            Object.keys(INITIAL_TOGGLE_STATE).map((key) => [key, Boolean(data[key])]),
          ),
        });
        setItemImage(null);
        setErrors({});

        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } catch (error) {
        toast.error(error.message || "Failed to load item details.");
      }
    };

    loadItemDetails();

    return () => {
      isMounted = false;
    };
  }, [editingItemId, isAuthorized]);

  useEffect(() => {
    if (!isAuthorized || editingItemId) {
      return;
    }

    let isMounted = true;

    const loadNextItemCode = async () => {
      try {
        const nextItemCode = await requestNextItemCode();
        if (isMounted) {
          setFormValues((currentValues) => ({
            ...currentValues,
            itemCode: nextItemCode,
          }));
        }
      } catch (error) {
        if (isMounted) {
          toast.error(error.message || "Failed to load the next item code.");
        }
      }
    };

    loadNextItemCode();

    return () => {
      isMounted = false;
    };
  }, [editingItemId, isAuthorized]);

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setFormValues((currentValues) => ({
      ...currentValues,
      [name]: value,
    }));
    setErrors((currentErrors) => {
      if (!currentErrors[name]) {
        return currentErrors;
      }

      const nextErrors = { ...currentErrors };
      delete nextErrors[name];
      return nextErrors;
    });
  };

  const handleToggleChange = (event) => {
    const { name, checked } = event.target;
    setToggles((currentValues) => ({
      ...currentValues,
      [name]: checked,
    }));
  };

  const handleImageChange = (event) => {
    setItemImage(event.target.files?.[0] || null);
    setErrors((currentErrors) => {
      if (!currentErrors.itemImage) {
        return currentErrors;
      }

      const nextErrors = { ...currentErrors };
      delete nextErrors.itemImage;
      return nextErrors;
    });
  };

  const validateForm = () => {
    const nextErrors = {};

    if (!formValues.itemType) {
      nextErrors.itemType = "Please choose an item type.";
    }

    if (!formValues.itemName.trim()) {
      nextErrors.itemName = "Item name is required.";
    } else if (formValues.itemName.trim().length > MAX_ITEM_NAME_LENGTH) {
      nextErrors.itemName = `Item name must be ${MAX_ITEM_NAME_LENGTH} characters or less.`;
    }

    if (!formValues.categoryName) {
      nextErrors.categoryName = "Please choose an item category.";
    }

    if (!formValues.itemGroup) {
      nextErrors.itemGroup = "Please choose an item group.";
    }

    if (!formValues.unit) {
      nextErrors.unit = "Please choose a unit.";
    }

    if (!formValues.tax) {
      nextErrors.tax = "Please choose a tax value.";
    }

    if (
      formValues.partNo &&
      formValues.partNo.trim().length > MAX_PART_OR_BATCH_LENGTH
    ) {
      nextErrors.partNo = `Part no must be ${MAX_PART_OR_BATCH_LENGTH} characters or less.`;
    }

    if (
      formValues.batchNo &&
      formValues.batchNo.trim().length > MAX_PART_OR_BATCH_LENGTH
    ) {
      nextErrors.batchNo = `Batch no must be ${MAX_PART_OR_BATCH_LENGTH} characters or less.`;
    }

    if (
      formValues.itemDescription &&
      formValues.itemDescription.trim().length > MAX_DESCRIPTION_LENGTH
    ) {
      nextErrors.itemDescription = `Item description must be ${MAX_DESCRIPTION_LENGTH} characters or less.`;
    }

    const decimalNumberFields = [
      ["mrp", "MRP"],
      ["purchasePrice", "Purchase price"],
      ["salesPrice", "Sales price"],
    ];

    for (const [fieldKey, label] of decimalNumberFields) {
      const rawValue = formValues[fieldKey];
      if (!rawValue) {
        continue;
      }

      const parsedValue = Number.parseFloat(rawValue);
      if (!Number.isFinite(parsedValue) || parsedValue < 0) {
        nextErrors[fieldKey] = `${label} must be a valid positive number.`;
      }
    }

    const wholeNumberFields = [
      ["minimumOrderQty", "Minimum order quantity"],
      ["minimumStockQty", "Minimum stock quantity"],
    ];

    for (const [fieldKey, label] of wholeNumberFields) {
      const rawValue = formValues[fieldKey];
      if (!rawValue) {
        continue;
      }

      const parsedValue = Number(rawValue);
      if (!Number.isInteger(parsedValue) || parsedValue < 0) {
        nextErrors[fieldKey] = `${label} must be a valid whole number.`;
      }
    }

    if (itemImage) {
      const fileName = itemImage.name.toLowerCase();
      const isJpegFile =
        itemImage.type === "image/jpeg" ||
        fileName.endsWith(".jpg") ||
        fileName.endsWith(".jpeg");

      if (!isJpegFile) {
        nextErrors.itemImage = "Item image must be a JPG or JPEG file.";
      }
    }

    return nextErrors;
  };

  const resetForm = (nextItemCode = "") => {
    setFormValues({
      ...INITIAL_FORM_STATE,
      itemCode: nextItemCode,
    });
    setToggles(INITIAL_TOGGLE_STATE);
    setItemImage(null);
    setErrors({});

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const getFieldInputClassName = (fieldName, ...extraClasses) =>
    [styles.fieldInput, errors[fieldName] ? styles.fieldInputError : "", ...extraClasses]
      .filter(Boolean)
      .join(" ");

  const renderFieldError = (fieldName) =>
    errors[fieldName] ? (
      <p className={styles.fieldError}>{errors[fieldName]}</p>
    ) : null;

  const mapServerErrors = (data) => {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return {};
    }

    return Object.entries(data).reduce((accumulator, [key, value]) => {
      if (Array.isArray(value) && value.length) {
        accumulator[key] = String(value[0]);
      } else if (typeof value === "string") {
        accumulator[key] = value;
      }

      return accumulator;
    }, {});
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationErrors = validateForm();
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = new FormData();

      Object.entries(formValues).forEach(([key, value]) => {
        payload.append(key, value);
      });

      Object.entries(toggles).forEach(([key, value]) => {
        payload.append(key, String(value));
      });

      if (itemImage) {
        payload.append("itemImage", itemImage);
      }

      const response = await fetchWithAdminAuth(
        editingItemId
          ? `${API_BASE_URL}/api/itemfolder/${editingItemId}/`
          : `${API_BASE_URL}/api/itemfolder/`,
        {
        method: editingItemId ? "PUT" : "POST",
        body: payload,
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const serverErrors = mapServerErrors(data);
        if (Object.keys(serverErrors).length > 0) {
          setErrors(serverErrors);
          return;
        }

        const errorMessage =
          typeof data?.error === "string"
            ? data.error
            : "Failed to save item.";
        throw new Error(errorMessage);
      }

      if (editingItemId) {
        resetForm(formValues.itemCode);
      } else {
        const nextItemCode = await requestNextItemCode().catch(() => "");
        resetForm(nextItemCode);
      }
      toast.success(editingItemId ? "Item updated successfully" : "Item saved successfully");
      if (editingItemId) {
        router.push("/itemview");
      }
    } catch (error) {
      toast.error(error.message || "Failed to save item.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (editingItemId) {
      router.push("/itemview");
      return;
    }

    requestNextItemCode()
      .then((nextItemCode) => {
        resetForm(nextItemCode);
      })
      .catch(() => {
        resetForm();
      });
  };

  if (isCheckingAuth || !isAuthorized) {
    return null;
  }

  return (
    <>
      <main className={styles.contentArea}>
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <h1>Add Item</h1>
               <button
      type="button"
      className={styles.viewButton}
      onClick={() => router.push("/itemview")}
    >
      <FaThList />
    </button>
            </div>

            <form className={styles.form} onSubmit={handleSubmit}>
              <div className={styles.formGrid}>
                <div className={`${styles.fieldColumn} ${styles.horizontalCardColumn}`}>
                  <div className={styles.horizontalCardField}>
                    <label className={styles.fieldLabel} htmlFor="itemCode">
                      Item Code
                    </label>
                    <div className={styles.horizontalCardFieldControl}>
                      <input
                        id="itemCode"
                        name="itemCode"
                        className={getFieldInputClassName("itemCode", styles.autoGeneratedInput)}
                        value={formValues.itemCode}
                        readOnly
                        aria-readonly="true"
                        aria-invalid={Boolean(errors.itemCode)}
                      />
                      {renderFieldError("itemCode")}
                    </div>
                  </div>

                  <div className={styles.horizontalCardField}>
                    <label className={styles.fieldLabel} htmlFor="itemType">
                      Item Type
                    </label>
                    <div className={styles.horizontalCardFieldControl}>
                      <select
                        id="itemType"
                        name="itemType"
                        className={getFieldInputClassName("itemType")}
                        value={formValues.itemType}
                        onChange={handleFieldChange}
                        aria-invalid={Boolean(errors.itemType)}
                      >
                        <option value="">Choose Item Type</option>
                        <option value="Finished Goods">Finished Goods</option>
                        <option value="Raw Material">Raw Material</option>
                        <option value="Service">Service</option>
                      </select>
                      {renderFieldError("itemType")}
                    </div>
                  </div>

                  <div className={styles.horizontalCardField}>
                    <label className={styles.fieldLabel} htmlFor="itemName">
                      Item Name
                    </label>
                    <div className={styles.horizontalCardFieldControl}>
                      <input
                        id="itemName"
                        name="itemName"
                        className={getFieldInputClassName("itemName")}
                        placeholder="Enter Item Name (max 100 characters)"
                        value={formValues.itemName}
                        onChange={handleFieldChange}
                        aria-invalid={Boolean(errors.itemName)}
                      />
                      {renderFieldError("itemName")}
                    </div>
                  </div>

                  <div className={styles.horizontalCardField}>
                    <label className={styles.fieldLabel} htmlFor="categoryName">
                      Item Category Name
                    </label>
                    <div className={styles.horizontalCardFieldControl}>
                      <select
                        id="categoryName"
                        name="categoryName"
                        className={getFieldInputClassName("categoryName")}
                        value={formValues.categoryName}
                        onChange={handleFieldChange}
                        aria-invalid={Boolean(errors.categoryName)}
                      >
                        <option value="">Choose Item Category</option>
                        <option value="Electrical">Electrical</option>
                        <option value="Hardware">Hardware</option>
                        <option value="Accessories">Accessories</option>
                      </select>
                      {renderFieldError("categoryName")}
                    </div>
                  </div>

                  <div className={styles.horizontalCardField}>
                    <label className={styles.fieldLabel} htmlFor="itemGroup">
                      Item Group
                    </label>
                    <div className={styles.horizontalCardFieldControl}>
                      <select
                        id="itemGroup"
                        name="itemGroup"
                        className={getFieldInputClassName("itemGroup")}
                        value={formValues.itemGroup}
                        onChange={handleFieldChange}
                        aria-invalid={Boolean(errors.itemGroup)}
                      >
                        <option value="">Choose Item Group</option>
                        <option value="General">General</option>
                        <option value="Premium">Premium</option>
                        <option value="Export">Export</option>
                      </select>
                      {renderFieldError("itemGroup")}
                    </div>
                  </div>

                  <div className={styles.horizontalCardField}>
                    <label className={styles.fieldLabel} htmlFor="minimumStockQty">
                      Minimum Stock Qty
                    </label>
                    <div className={styles.horizontalCardFieldControl}>
                      <input
                        id="minimumStockQty"
                        name="minimumStockQty"
                        className={getFieldInputClassName("minimumStockQty")}
                        placeholder="Enter Minimum Stock Qty"
                        value={formValues.minimumStockQty}
                        onChange={handleFieldChange}
                        aria-invalid={Boolean(errors.minimumStockQty)}
                      />
                      {renderFieldError("minimumStockQty")}
                    </div>
                  </div>
                </div>

                <div className={`${styles.fieldColumn} ${styles.horizontalCardColumn}`}>
                  <div className={styles.horizontalCardField}>
                    <label className={styles.fieldLabel} htmlFor="unit">
                      Unit
                    </label>
                    <div className={styles.horizontalCardFieldControl}>
                      <select
                        id="unit"
                        name="unit"
                        className={getFieldInputClassName("unit")}
                        value={formValues.unit}
                        onChange={handleFieldChange}
                        aria-invalid={Boolean(errors.unit)}
                      >
                        <option value="">Choose Unit</option>
                        <option value="Nos">Nos</option>
                        <option value="Box">Box</option>
                        <option value="Kg">Kg</option>
                      </select>
                      {renderFieldError("unit")}
                    </div>
                  </div>

                  <div className={styles.horizontalCardField}>
                    <label className={styles.fieldLabel} htmlFor="hsnCode">
                      HSN &amp; SAC Code
                    </label>
                    <div className={styles.horizontalCardFieldControl}>
                      <input
                        id="hsnCode"
                        name="hsnCode"
                        className={getFieldInputClassName("hsnCode")}
                        placeholder="Enter HSN & SAC Code"
                        value={formValues.hsnCode}
                        onChange={handleFieldChange}
                        aria-invalid={Boolean(errors.hsnCode)}
                      />
                      {renderFieldError("hsnCode")}
                    </div>
                  </div>

                  <div className={styles.horizontalCardField}>
                    <label className={styles.fieldLabel} htmlFor="tax">
                      Tax
                    </label>
                    <div className={styles.horizontalCardFieldControl}>
                      <select
                        id="tax"
                        name="tax"
                        className={getFieldInputClassName("tax")}
                        value={formValues.tax}
                        onChange={handleFieldChange}
                        aria-invalid={Boolean(errors.tax)}
                      >
                        <option value="">Choose Tax</option>
                        <option value="5%">5%</option>
                        <option value="12%">12%</option>
                        <option value="18%">18%</option>
                      </select>
                      {renderFieldError("tax")}
                    </div>
                  </div>

                  <div className={styles.horizontalCardField}>
                    <label className={styles.fieldLabel} htmlFor="partNo">
                      Part No
                    </label>
                    <div className={styles.horizontalCardFieldControl}>
                      <input
                        id="partNo"
                        name="partNo"
                        className={getFieldInputClassName("partNo")}
                        placeholder="Enter Part No (max 20 characters)"
                        value={formValues.partNo}
                        onChange={handleFieldChange}
                        aria-invalid={Boolean(errors.partNo)}
                      />
                      {renderFieldError("partNo")}
                    </div>
                  </div>

                  <div className={styles.horizontalCardField}>
                    <label className={styles.fieldLabel} htmlFor="batchNo">
                      Batch No
                    </label>
                    <div className={styles.horizontalCardFieldControl}>
                      <input
                        id="batchNo"
                        name="batchNo"
                        className={getFieldInputClassName("batchNo")}
                        placeholder="Enter Batch No (max 20 characters)"
                        value={formValues.batchNo}
                        onChange={handleFieldChange}
                        aria-invalid={Boolean(errors.batchNo)}
                      />
                      {renderFieldError("batchNo")}
                    </div>
                  </div>

                  <div className={styles.horizontalCardField}>
                    <div className={styles.imageLabelRow}>
                      <label className={styles.fieldLabel} htmlFor="itemImage">
                        Item Image
                      </label>
                      <span className={styles.imageHint}>[JPG/JPEG]</span>
                    </div>
                    <div className={styles.horizontalCardFieldControl}>
                      <input
                        id="itemImage"
                        name="itemImage"
                        ref={fileInputRef}
                        className={getFieldInputClassName("itemImage", styles.fileInput)}
                        type="file"
                        accept=".jpg,.jpeg,image/jpeg"
                        onChange={handleImageChange}
                        aria-invalid={Boolean(errors.itemImage)}
                      />
                      {renderFieldError("itemImage")}
                    </div>
                  </div>
                </div>
              
                <div className={`${styles.fieldColumn} ${styles.horizontalCardColumn}`}>
                  <div className={styles.horizontalCardField}>
                    <label className={styles.fieldLabel} htmlFor="mrp">
                      MRP
                    </label>
                    <div className={styles.horizontalCardFieldControl}>
                      <input
                        id="mrp"
                        name="mrp"
                        className={getFieldInputClassName("mrp")}
                        placeholder="Enter Amount"
                        value={formValues.mrp}
                        onChange={handleFieldChange}
                        aria-invalid={Boolean(errors.mrp)}
                      />
                      {renderFieldError("mrp")}
                    </div>
                  </div>

                  <div className={styles.horizontalCardField}>
                    <label className={styles.fieldLabel} htmlFor="purchasePrice">
                      Purchase Price
                    </label>
                    <div className={styles.horizontalCardFieldControl}>
                      <input
                        id="purchasePrice"
                        name="purchasePrice"
                        className={getFieldInputClassName("purchasePrice")}
                        placeholder="Enter Price"
                        value={formValues.purchasePrice}
                        onChange={handleFieldChange}
                        aria-invalid={Boolean(errors.purchasePrice)}
                      />
                      {renderFieldError("purchasePrice")}
                    </div>
                  </div>

                  <div className={styles.horizontalCardField}>
                    <label className={styles.fieldLabel} htmlFor="salesPrice">
                      Sales Price
                    </label>
                    <div className={styles.horizontalCardFieldControl}>
                      <input
                        id="salesPrice"
                        name="salesPrice"
                        className={getFieldInputClassName("salesPrice")}
                        placeholder="Enter Price"
                        value={formValues.salesPrice}
                        onChange={handleFieldChange}
                        aria-invalid={Boolean(errors.salesPrice)}
                      />
                      {renderFieldError("salesPrice")}
                    </div>
                  </div>

                  <div className={styles.horizontalCardField}>
                    <span className={styles.fieldLabel}>Options</span>
                    <div className={styles.horizontalCardFieldControl}>
                      <div className={styles.checkboxGrid}>
                        <label className={styles.checkboxLabel}>
                          <input
                            type="checkbox"
                            name="isStock"
                            checked={toggles.isStock}
                            onChange={handleToggleChange}
                          />
                          <span>Is Stock</span>
                        </label>
                        <label className={styles.checkboxLabel}>
                          <input
                            type="checkbox"
                            name="isActive"
                            checked={toggles.isActive}
                            onChange={handleToggleChange}
                          />
                          <span>Is Active</span>
                        </label>
                        <label className={styles.checkboxLabel}>
                          <input
                            type="checkbox"
                            name="needQc"
                            checked={toggles.needQc}
                            onChange={handleToggleChange}
                          />
                          <span>Need QC</span>
                        </label>
                        <label className={styles.checkboxLabel}>
                          <input
                            type="checkbox"
                            name="needService"
                            checked={toggles.needService}
                            onChange={handleToggleChange}
                          />
                          <span>Need Service</span>
                        </label>
                        <label className={styles.checkboxLabel}>
                          <input
                            type="checkbox"
                            name="needWarranty"
                            checked={toggles.needWarranty}
                            onChange={handleToggleChange}
                          />
                          <span>Need Warranty</span>
                        </label>
                        <label className={styles.checkboxLabel}>
                          <input
                            type="checkbox"
                            name="needSerialNo"
                            checked={toggles.needSerialNo}
                            onChange={handleToggleChange}
                          />
                          <span>Need Serial No</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className={styles.horizontalCardField}>
                    <label className={styles.fieldLabel} htmlFor="minimumOrderQty">
                      Minimum Order Qty
                    </label>
                    <div className={styles.horizontalCardFieldControl}>
                      <input
                        id="minimumOrderQty"
                        name="minimumOrderQty"
                        className={getFieldInputClassName("minimumOrderQty")}
                        placeholder="Enter Minimum Order Qty"
                        value={formValues.minimumOrderQty}
                        onChange={handleFieldChange}
                        aria-invalid={Boolean(errors.minimumOrderQty)}
                      />
                      {renderFieldError("minimumOrderQty")}
                    </div>
                  </div>

                  <div className={styles.horizontalCardField}>
                    <label className={styles.fieldLabel} htmlFor="itemDescription">
                      Item Description
                    </label>
                    <div className={styles.horizontalCardFieldControl}>
                      <textarea
                        id="itemDescription"
                        name="itemDescription"
                        className={getFieldInputClassName("itemDescription", styles.textareaInput)}
                        placeholder="Write here (max 250 characters)"
                        value={formValues.itemDescription}
                        onChange={handleFieldChange}
                        aria-invalid={Boolean(errors.itemDescription)}
                      />
                      {renderFieldError("itemDescription")}
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.actionRow}>
                <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : "Submit"}
                </button>
                <button
                  type="button"
                  className={styles.cancelButton}
                  onClick={handleCancel}
                  disabled={isSubmitting}
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
            </form>
          </section>
      </main>

      <ToastContainer position="top-right" autoClose={3000} />
    </>
  );
}

export default function ItemPage() {
  return (
    <Suspense fallback={null}>
      <ItemPageContent />
    </Suspense>
  );
}
