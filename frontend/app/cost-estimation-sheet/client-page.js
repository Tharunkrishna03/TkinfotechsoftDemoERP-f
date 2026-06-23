"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FaEdit, FaThList, FaTrashAlt } from "react-icons/fa";
import { ToastContainer, toast } from "react-toastify";

import "react-toastify/dist/ReactToastify.css";

import {
  clearStoredAdminAuth,
  fetchWithAdminAuth,
  getStoredAdminAuth,
  verifyAdminAccess,
} from "@/lib/admin-auth";

import styles from "./cost-estimation-sheet.module.css";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");
const FIXED_TAX_PERCENTAGE = 18;
const FIXED_PROFIT_MARGIN_PERCENTAGE = 10;

const SECTION_CONFIGS = [
  {
    key: "raw_material",
    title: "Raw Material",
    mode: "catalog",
    primaryLabel: "Material name",
    secondaryLabel: "Category",
    rateLabel: "Unit price",
    totalLabel: "Total Raw Material Cost",
  },
  {
    key: "manufacturing",
    title: "Services",
    mode: "catalog",
    primaryLabel: "Process step",
    secondaryLabel: "Machine Used",
    rateLabel: "Cost/Hour",
    totalLabel: "Total Process Cost",
  },
  {
    key: "labor",
    title: "Manpower",
    mode: "catalog",
    primaryLabel: "Role",
    secondaryLabel: "",
    rateLabel: "Rate/Hour",
    totalLabel: "Total Manpower Cost",
  },

  {
    key: "packaging",
    title: "Transport",
    mode: "catalog",
    primaryLabel: "Item",
    secondaryLabel: "",
    rateLabel: "Cost",
    totalLabel: "Total Transport Cost",
  },
  {
    key: "overhead",
    title: "Overhead Cost",
    mode: "single_amount",
    amountLabel: "Overhead amount",
    totalLabel: "Total Overhead Cost",
  },
  {
    key: "miscellaneous",
    title: "Miscellaneous",
    mode: "single_amount",
    amountLabel: "Miscellaneous amount",
    totalLabel: "Total Miscellaneous Cost",
  },
];

function createSectionState(factory) {
  return SECTION_CONFIGS.reduce((accumulator, config) => {
    accumulator[config.key] = factory(config);
    return accumulator;
  }, {});
}

function createSectionDraft(config) {
  if (config.mode === "single_amount") {
    return {
      amount: "",
    };
  }

  if (config.mode === "manual") {
    return {
      itemName: "",
      unit: "",
      rate: "",
      quantity: "",
      editingRowId: "",
    };
  }

  return {
    rateId: "",
    quantity: "",
    editingRowId: "",
  };
}

function createDraftState() {
  return createSectionState((config) => createSectionDraft(config));
}

function createRowsState() {
  return createSectionState(() => []);
}

function parseNumericValue(value) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function formatAmount(value) {
  return parseNumericValue(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatQuantity(value) {
  const parsedValue = parseNumericValue(value);

  if (Number.isInteger(parsedValue)) {
    return String(parsedValue);
  }

  return parsedValue.toFixed(2).replace(/\.?0+$/, "");
}

function buildRowId(sectionKey) {
  return `${sectionKey}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildSingleAmountRow(config, amount) {
  const numericAmount = parseNumericValue(amount);

  if (numericAmount <= 0) {
    return null;
  }

  return {
    rowId: `${config.key}-single`,
    section: config.key,
    rateId: null,
    itemName: config.title,
    secondaryLabel: "",
    secondaryValue: "",
    unit: "",
    rate: numericAmount,
    quantity: 1,
    total: numericAmount,
  };
}

function getFirstErrorMessage(source) {
  if (!source) {
    return "Failed to save the cost estimation sheet.";
  }

  if (typeof source === "string") {
    return source;
  }

  if (Array.isArray(source)) {
    return getFirstErrorMessage(source[0]);
  }

  if (typeof source === "object") {
    return getFirstErrorMessage(Object.values(source)[0]);
  }

  return "Failed to save the cost estimation sheet.";
}

async function requestCostEstimationCatalog(sheetId) {
  const query = sheetId ? `?sheetId=${encodeURIComponent(sheetId)}` : "";
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/cost-estimation/catalog/${query}`, {
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Failed to load cost estimation data.");
  }

  return data;
}

async function requestNextCostEstimationNumber(salesServiceRequestId) {
  if (!salesServiceRequestId) {
    return "";
  }

  const response = await fetchWithAdminAuth(
    `${API_BASE_URL}/api/cost-estimation/next-number/?salesServiceRequestId=${encodeURIComponent(
      salesServiceRequestId,
    )}`,
    {
      cache: "no-store",
    },
  );
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Failed to load cost estimation number.");
  }

  return String(data?.costEstimationNo || "").trim();
}

async function saveCostEstimationSheet(payload) {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/cost-estimation/sheets/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(getFirstErrorMessage(data));
  }

  return data;
}

async function requestCostEstimationSheetDetail(id) {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/cost-estimation/sheets/${id}/`, {
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Failed to load cost estimation sheet.");
  }

  return data;
}

async function updateCostEstimationSheet(id, payload) {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/cost-estimation/sheets/${id}/`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(getFirstErrorMessage(data));
  }

  return data;
}

function findMatchingCatalogRateId(row, availableRates) {
  const exactMatch = availableRates.find(
    (rate) =>
      String(rate.itemName || "") === String(row.itemName || "") &&
      String(rate.secondaryLabel || "") === String(row.secondaryLabel || "") &&
      String(rate.secondaryValue || "") === String(row.secondaryValue || "") &&
      String(rate.unit || "") === String(row.unit || "") &&
      parseNumericValue(rate.rate) === parseNumericValue(row.rate),
  );

  if (exactMatch) {
    return String(exactMatch.id);
  }

  const looseMatch = availableRates.find(
    (rate) =>
      String(rate.itemName || "") === String(row.itemName || "") &&
      parseNumericValue(rate.rate) === parseNumericValue(row.rate),
  );

  return looseMatch ? String(looseMatch.id) : "";
}

function buildSectionStateFromSheet(sheetRows, catalogSectionsByKey) {
  const nextRows = createRowsState();
  const nextDrafts = createDraftState();
  const sortedRows = [...(Array.isArray(sheetRows) ? sheetRows : [])].sort(
    (leftRow, rightRow) =>
      parseNumericValue(leftRow.displayOrder) - parseNumericValue(rightRow.displayOrder),
  );
  const singleAmountTotals = {};

  sortedRows.forEach((row, index) => {
    const config = SECTION_CONFIGS.find((section) => section.key === row.section);

    if (!config) {
      return;
    }

    if (config.mode === "single_amount") {
      singleAmountTotals[config.key] =
        parseNumericValue(singleAmountTotals[config.key]) + parseNumericValue(row.total);
      return;
    }

    const availableRates = catalogSectionsByKey[config.key] || [];
    nextRows[config.key].push({
      rowId: `sheet-row-${row.id || `${config.key}-${index}`}`,
      section: config.key,
      rateId:
        config.mode === "catalog" ? findMatchingCatalogRateId(row, availableRates) : null,
      itemName: row.itemName || "",
      secondaryLabel: row.secondaryLabel || "",
      secondaryValue: row.secondaryValue || "",
      unit: row.unit || "",
      rate: parseNumericValue(row.rate),
      quantity: parseNumericValue(row.quantity),
      total: parseNumericValue(row.total),
    });
  });

  SECTION_CONFIGS.filter((config) => config.mode === "single_amount").forEach((config) => {
    nextDrafts[config.key] = {
      amount:
        parseNumericValue(singleAmountTotals[config.key]) > 0
          ? String(parseNumericValue(singleAmountTotals[config.key]))
          : "",
    };
  });

  return {
    nextRows,
    nextDrafts,
  };
}

function buildCostEstimationRows(sectionRows, sectionDrafts) {
  return SECTION_CONFIGS.flatMap((config) => {
    if (config.mode === "single_amount") {
      const singleRow = buildSingleAmountRow(config, sectionDrafts[config.key]?.amount);

      if (!singleRow) {
        return [];
      }

      return [
        {
          section: config.key,
          itemName: singleRow.itemName,
          secondaryLabel: "",
          secondaryValue: "",
          unit: "",
          rate: parseNumericValue(singleRow.rate),
          quantity: 1,
          total: parseNumericValue(singleRow.total),
          displayOrder: 1,
        },
      ];
    }

    return (sectionRows[config.key] || []).map((row, index) => ({
      section: config.key,
      itemName: row.itemName,
      secondaryLabel: row.secondaryLabel || "",
      secondaryValue: row.secondaryValue || "",
      unit: row.unit || "",
      rate: parseNumericValue(row.rate),
      quantity: parseNumericValue(row.quantity),
      total: parseNumericValue(row.total),
      displayOrder: index + 1,
    }));
  });
}

export default function CostEstimationSheetPageClient({
  editingSheetId = "",
  isRevisionMode = false,
}) {
  const router = useRouter();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [pageError, setPageError] = useState("");
  const [references, setReferences] = useState([]);
  const [catalogSections, setCatalogSections] = useState(() => createRowsState());
  const [selectedReferenceId, setSelectedReferenceId] = useState("");
  const [costEstimationNo, setCostEstimationNo] = useState("");
  const [sectionDrafts, setSectionDrafts] = useState(() => createDraftState());
  const [sectionRows, setSectionRows] = useState(() => createRowsState());

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
    setIsLoadingCatalog(true);

    (async () => {
      try {
        const catalogData = await requestCostEstimationCatalog(editingSheetId);
        const nextReferences = Array.isArray(catalogData.references)
          ? catalogData.references
          : [];
        const nextCatalogSections = createSectionState((config) => {
          const sectionRowsList = catalogData?.sections?.[config.key];
          return Array.isArray(sectionRowsList) ? sectionRowsList : [];
        });
        const sheetData = editingSheetId
          ? await requestCostEstimationSheetDetail(editingSheetId)
          : null;

        if (!isMounted) {
          return;
        }

        setReferences(nextReferences);
        setCatalogSections(nextCatalogSections);

        if (sheetData) {
          const nextSectionState = buildSectionStateFromSheet(
            sheetData.rows,
            nextCatalogSections,
          );
          const matchingReference = nextReferences.find(
            (reference) => reference.referenceNo === sheetData.referenceNo,
          );
          setIsReadOnly(isRevisionMode ? false : Boolean(sheetData.isReadOnly));
          setPageError(
            isRevisionMode
              ? ""
              : sheetData.isReadOnly
                ? "This cost estimation sheet is read only because it is already in approval, approved, or used in quotation."
                : "",
          );
          setSelectedReferenceId(matchingReference ? String(matchingReference.id) : "");
          setCostEstimationNo(isRevisionMode ? "" : sheetData.costEstimationNo || "");
          setSectionRows(nextSectionState.nextRows);
          setSectionDrafts(nextSectionState.nextDrafts);
        } else {
          setPageError("");
          setIsReadOnly(false);
          setCostEstimationNo("");
          setSectionRows(createRowsState());
          setSectionDrafts(createDraftState());
        }
      } catch (error) {
        if (isMounted) {
          const message = error.message || "Failed to load cost estimation data.";
          setPageError(message);
          toast.error(message);
        }
      } finally {
        if (isMounted) {
          setIsLoadingCatalog(false);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [editingSheetId, isAuthorized, isRevisionMode]);

  useEffect(() => {
    if (!isAuthorized || (editingSheetId && !isRevisionMode)) {
      return;
    }

    if (!selectedReferenceId) {
      setCostEstimationNo("");
      return;
    }

    let isMounted = true;

    requestNextCostEstimationNumber(selectedReferenceId)
      .then((nextCostEstimationNo) => {
        if (isMounted) {
          setCostEstimationNo(nextCostEstimationNo);
        }
      })
      .catch((error) => {
        if (isMounted) {
          toast.error(error.message || "Failed to load cost estimation number.");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [editingSheetId, isAuthorized, isRevisionMode, selectedReferenceId]);

  const selectedRequest =
    references.find((reference) => String(reference.id) === selectedReferenceId) || null;

  const sectionTotals = SECTION_CONFIGS.reduce((accumulator, config) => {
    accumulator[config.key] =
      config.mode === "single_amount"
        ? parseNumericValue(sectionDrafts[config.key]?.amount)
        : (sectionRows[config.key] || []).reduce(
            (total, row) => total + parseNumericValue(row.total),
            0,
          );
    return accumulator;
  }, {});

  const subtotal = SECTION_CONFIGS.reduce(
    (total, config) => total + parseNumericValue(sectionTotals[config.key]),
    0,
  );
  const taxAmount = subtotal * (FIXED_TAX_PERCENTAGE / 100);
  const profitMarginAmount = subtotal * (FIXED_PROFIT_MARGIN_PERCENTAGE / 100);
  const finalBatteryCost = subtotal + taxAmount + profitMarginAmount;
  const requestedQuantity = parseNumericValue(selectedRequest?.quantity);
  const costPerUnit = requestedQuantity > 0 ? finalBatteryCost / requestedQuantity : 0;

  const getFieldInputClassName = (...extraClasses) =>
    [styles.fieldInput, ...extraClasses].filter(Boolean).join(" ");

  const resetSectionDraft = (sectionKey) => {
    const config = SECTION_CONFIGS.find((item) => item.key === sectionKey);
    if (!config) {
      return;
    }

    setSectionDrafts((currentDrafts) => ({
      ...currentDrafts,
      [sectionKey]: createSectionDraft(config),
    }));
  };

  const resetForm = () => {
    setSelectedReferenceId("");
    setCostEstimationNo("");
    setSectionDrafts(createDraftState());
    setSectionRows(createRowsState());
  };

  const handleReferenceChange = (event) => {
    setSelectedReferenceId(event.target.value);
  };

  const handleDraftChange = (sectionKey, fieldName, value) => {
    setSectionDrafts((currentDrafts) => ({
      ...currentDrafts,
      [sectionKey]: {
        ...currentDrafts[sectionKey],
        [fieldName]: value,
      },
    }));
  };

  const handleSingleAmountChange = (sectionKey) => (event) => {
    const { value } = event.target;

    if (value === "" || parseNumericValue(value) >= 0) {
      handleDraftChange(sectionKey, "amount", value);
    }
  };

  const handleEditRow = (config, row) => {
    if (config.mode === "manual") {
      setSectionDrafts((currentDrafts) => ({
        ...currentDrafts,
        [config.key]: {
          itemName: row.itemName || "",
          unit: row.unit || "",
          rate: String(row.rate ?? ""),
          quantity: String(row.quantity ?? ""),
          editingRowId: row.rowId,
        },
      }));
      return;
    }

    setSectionDrafts((currentDrafts) => ({
      ...currentDrafts,
      [config.key]: {
        rateId: String(row.rateId || ""),
        quantity: String(row.quantity ?? ""),
        editingRowId: row.rowId,
      },
    }));
  };

  const handleRemoveRow = (sectionKey, rowId) => {
    setSectionRows((currentRows) => ({
      ...currentRows,
      [sectionKey]: (currentRows[sectionKey] || []).filter((row) => row.rowId !== rowId),
    }));

    setSectionDrafts((currentDrafts) => {
      if (currentDrafts[sectionKey]?.editingRowId !== rowId) {
        return currentDrafts;
      }

      const config = SECTION_CONFIGS.find((item) => item.key === sectionKey);
      return {
        ...currentDrafts,
        [sectionKey]: createSectionDraft(config),
      };
    });
  };

  const handleAddOrUpdateRow = (config) => {
    const draft = sectionDrafts[config.key];
    const quantity = parseNumericValue(draft.quantity);

    if (quantity <= 0) {
      toast.error("Enter a valid number of unit.");
      return;
    }

    let rowPayload;

    if (config.mode === "manual") {
      const itemName = String(draft.itemName || "").trim();
      const unit = String(draft.unit || "").trim();
      const rate = parseNumericValue(draft.rate);

      if (!itemName) {
        toast.error("Enter item name before adding.");
        return;
      }

      if (rate < 0) {
        toast.error("Enter a valid rate.");
        return;
      }

      rowPayload = {
        rowId: draft.editingRowId || buildRowId(config.key),
        section: config.key,
        rateId: null,
        itemName,
        secondaryLabel: "",
        secondaryValue: "",
        unit,
        rate,
        quantity,
        total: rate * quantity,
      };
    } else {
      const availableRates = catalogSections[config.key] || [];
      const selectedRate = availableRates.find((row) => String(row.id) === draft.rateId);

      if (!selectedRate) {
        toast.error(`Select ${config.primaryLabel.toLowerCase()} before adding.`);
        return;
      }

      const unitRate = parseNumericValue(selectedRate.rate);

      rowPayload = {
        rowId: draft.editingRowId || buildRowId(config.key),
        section: config.key,
        rateId: selectedRate.id,
        itemName: selectedRate.itemName || "",
        secondaryLabel: selectedRate.secondaryLabel || config.secondaryLabel || "",
        secondaryValue: selectedRate.secondaryValue || "",
        unit: selectedRate.unit || "",
        rate: unitRate,
        quantity,
        total: unitRate * quantity,
      };
    }

    setSectionRows((currentRows) => {
      const currentSectionRows = [...(currentRows[config.key] || [])];
      const existingIndex = currentSectionRows.findIndex(
        (row) => row.rowId === rowPayload.rowId,
      );

      if (existingIndex >= 0) {
        currentSectionRows[existingIndex] = rowPayload;
      } else {
        currentSectionRows.push(rowPayload);
      }

      return {
        ...currentRows,
        [config.key]: currentSectionRows,
      };
    });

    resetSectionDraft(config.key);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (isReadOnly) {
      toast.error("This cost estimation sheet is read only.");
      return;
    }

    if (!selectedReferenceId) {
      toast.error("Select ref no before submitting.");
      return;
    }

    const allRows = buildCostEstimationRows(sectionRows, sectionDrafts);

    if (allRows.length === 0) {
      toast.error("Add at least one row before submitting.");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        salesServiceRequestId: Number(selectedReferenceId),
        taxPercentage: FIXED_TAX_PERCENTAGE,
        profitMarginPercentage: FIXED_PROFIT_MARGIN_PERCENTAGE,
        rows: allRows,
      };
      if (isRevisionMode && editingSheetId) {
        payload.revisionSourceSheetId = Number(editingSheetId);
      }

      const data = editingSheetId && !isRevisionMode
        ? await updateCostEstimationSheet(editingSheetId, payload)
        : await saveCostEstimationSheet(payload);

      toast.success(
        editingSheetId && !isRevisionMode
          ? data?.referenceNo
            ? `${data.referenceNo} cost estimation updated successfully`
            : "Cost estimation sheet updated successfully"
          : data?.data?.referenceNo
            ? `${data.data.costEstimationNo || data.data.referenceNo} cost estimation saved successfully`
          : "Cost estimation sheet saved successfully",
      );
      if (editingSheetId) {
        router.push("/cost-estimation-sheet-list");
        return;
      }

      resetForm();
    } catch (error) {
      toast.error(error.message || "Failed to save the cost estimation sheet.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (editingSheetId) {
      router.push("/cost-estimation-sheet-list");
      return;
    }

    resetForm();
  };

  if (isCheckingAuth || !isAuthorized) {
    return null;
  }

  return (
    <>
      <main className={styles.contentArea}>
        <section className={styles.card}>
          <div className={styles.cardHeader}>
            <h1>Cost Estimation Sheet</h1>
            <button
              type="button"
              className={styles.viewButton}
              onClick={() => router.push("/cost-estimation-sheet-list")}
              aria-label="Open saved cost estimation sheets"
              title="Open saved cost estimation sheets"
            >
              <FaThList />
            </button>
          </div>

          {pageError ? <div className={styles.errorBanner}>{pageError}</div> : null}

          {isLoadingCatalog ? (
            <div className={styles.loadingState}>Loading cost estimation data...</div>
          ) : (
            <form className={styles.form} onSubmit={handleSubmit}>
              <fieldset className={styles.formFieldset} disabled={isReadOnly}>
                <div className={styles.cardsStack}>
                <section className={styles.sectionCard}>
                  <div className={styles.sectionTitleRow}>
                    <h2 className={styles.sectionTitle}>Reference Details</h2>
                  </div>
                  <div className={styles.sectionGrid}>
                    <div className={styles.fieldColumn}>
                      <label className={styles.fieldLabel} htmlFor="costEstimationNo">
                        CST no
                      </label>
                      <input
                        id="costEstimationNo"
                        className={getFieldInputClassName(styles.fieldInputMuted)}
                        value={costEstimationNo}
                        readOnly
                        aria-readonly="true"
                      />
                    </div>

                    <div className={styles.fieldColumn}>
                      <label className={styles.fieldLabel} htmlFor="referenceNo">
                        Ref no
                      </label>
                      <select
                        id="referenceNo"
                        className={getFieldInputClassName()}
                        value={selectedReferenceId}
                        onChange={handleReferenceChange}
                      >
                        <option value="">Choose ref no</option>
                        {references.map((reference) => (
                          <option key={reference.id} value={reference.id}>
                            {reference.referenceNo}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className={styles.fieldColumn}>
                      <label className={styles.fieldLabel} htmlFor="clientName">
                        Client name
                      </label>
                      <input
                        id="clientName"
                        className={getFieldInputClassName(styles.fieldInputMuted)}
                        value={selectedRequest?.clientName || ""}
                        readOnly
                        aria-readonly="true"
                      />
                    </div>

                    <div className={styles.fieldColumn}>
                      <label className={styles.fieldLabel} htmlFor="phoneNo">
                        Phone number
                      </label>
                      <input
                        id="phoneNo"
                        className={getFieldInputClassName(styles.fieldInputMuted)}
                        value={selectedRequest?.phoneNo || ""}
                        readOnly
                        aria-readonly="true"
                      />
                    </div>

                    <div className={styles.fieldColumn}>
                      <label className={styles.fieldLabel} htmlFor="companyName">
                        Company name
                      </label>
                      <input
                        id="companyName"
                        className={getFieldInputClassName(styles.fieldInputMuted)}
                        value={selectedRequest?.companyName || ""}
                        readOnly
                        aria-readonly="true"
                      />
                    </div>
                  </div>
                </section>

                {SECTION_CONFIGS.map((config) => {
                  const draft = sectionDrafts[config.key];
                  const isSingleAmount = config.mode === "single_amount";
                  const sectionOptions = catalogSections[config.key] || [];
                  const selectedRate =
                    config.mode === "catalog"
                      ? sectionOptions.find((row) => String(row.id) === draft.rateId) || null
                      : null;
                  const rateValue =
                    config.mode === "manual"
                      ? parseNumericValue(draft.rate)
                      : parseNumericValue(selectedRate?.rate);
                  const pendingAmount = rateValue * parseNumericValue(draft.quantity);
                  const rows = sectionRows[config.key] || [];
                  const showSecondaryColumn = Boolean(config.secondaryLabel);
                  const isEditing = Boolean(draft.editingRowId);

                  return (
                    <section key={config.key} className={styles.sectionCard}>
                      <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle}>{config.title}</h2>
                        <div className={styles.totalBadge}>
                          {config.totalLabel}: {formatAmount(sectionTotals[config.key])}
                        </div>
                      </div>

                      {isSingleAmount ? (
                        <div className={styles.sectionGrid}>
                          <div className={styles.fieldColumn}>
                            <label className={styles.fieldLabel} htmlFor={`${config.key}-amount`}>
                              {config.amountLabel}
                            </label>
                            <input
                              id={`${config.key}-amount`}
                              type="number"
                              min="0"
                              step="0.01"
                              className={getFieldInputClassName()}
                              placeholder={`Enter ${config.amountLabel.toLowerCase()}`}
                              value={draft.amount}
                              onChange={handleSingleAmountChange(config.key)}
                            />
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className={styles.entryGrid}>
                            <div className={styles.fieldColumn}>
                              <label className={styles.fieldLabel} htmlFor={`${config.key}-item`}>
                                {config.primaryLabel}
                              </label>
                              {config.mode === "manual" ? (
                                <input
                                  id={`${config.key}-item`}
                                  className={getFieldInputClassName()}
                                  placeholder={`Enter ${config.primaryLabel.toLowerCase()}`}
                                  value={draft.itemName}
                                  onChange={(event) =>
                                    handleDraftChange(config.key, "itemName", event.target.value)
                                  }
                                />
                              ) : (
                                <select
                                  id={`${config.key}-item`}
                                  className={getFieldInputClassName()}
                                  value={draft.rateId}
                                  onChange={(event) =>
                                    handleDraftChange(config.key, "rateId", event.target.value)
                                  }
                                >
                                  <option value="">Choose {config.primaryLabel.toLowerCase()}</option>
                                  {sectionOptions.map((option) => (
                                    <option key={option.id} value={option.id}>
                                      {option.itemName}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>

                            {showSecondaryColumn ? (
                              <div className={styles.fieldColumn}>
                                <label
                                  className={styles.fieldLabel}
                                  htmlFor={`${config.key}-secondaryValue`}
                                >
                                  {config.secondaryLabel}
                                </label>
                                <input
                                  id={`${config.key}-secondaryValue`}
                                  className={getFieldInputClassName(styles.fieldInputMuted)}
                                  value={selectedRate?.secondaryValue || ""}
                                  readOnly
                                  aria-readonly="true"
                                />
                              </div>
                            ) : null}

                            <div className={styles.fieldColumn}>
                              <label className={styles.fieldLabel} htmlFor={`${config.key}-unit`}>
                                Unit
                              </label>
                              <input
                                id={`${config.key}-unit`}
                                className={getFieldInputClassName(
                                  config.mode === "manual" ? "" : styles.fieldInputMuted,
                                )}
                                placeholder={config.mode === "manual" ? "Enter unit" : undefined}
                                value={config.mode === "manual" ? draft.unit : selectedRate?.unit || ""}
                                readOnly={config.mode !== "manual"}
                                aria-readonly={config.mode !== "manual" ? "true" : undefined}
                                onChange={
                                  config.mode === "manual"
                                    ? (event) =>
                                        handleDraftChange(config.key, "unit", event.target.value)
                                    : undefined
                                }
                              />
                            </div>

                            <div className={styles.fieldColumn}>
                              <label className={styles.fieldLabel} htmlFor={`${config.key}-rate`}>
                                {config.rateLabel}
                              </label>
                              <input
                                id={`${config.key}-rate`}
                                type={config.mode === "manual" ? "number" : "text"}
                                min="0"
                                step="0.01"
                                className={getFieldInputClassName(
                                  config.mode === "manual" ? "" : styles.fieldInputMuted,
                                )}
                                placeholder={
                                  config.mode === "manual"
                                    ? `Enter ${config.rateLabel.toLowerCase()}`
                                    : undefined
                                }
                                value={
                                  config.mode === "manual"
                                    ? draft.rate
                                    : selectedRate
                                      ? formatAmount(selectedRate.rate)
                                      : ""
                                }
                                readOnly={config.mode !== "manual"}
                                aria-readonly={config.mode !== "manual" ? "true" : undefined}
                                onChange={
                                  config.mode === "manual"
                                    ? (event) =>
                                        handleDraftChange(config.key, "rate", event.target.value)
                                    : undefined
                                }
                              />
                            </div>

                            <div className={styles.fieldColumn}>
                              <label className={styles.fieldLabel} htmlFor={`${config.key}-quantity`}>
                                No of unit
                              </label>
                              <input
                                id={`${config.key}-quantity`}
                                type="number"
                                min="0"
                                step="0.01"
                                className={getFieldInputClassName()}
                                placeholder="Enter no of unit"
                                value={draft.quantity}
                                onChange={(event) =>
                                  handleDraftChange(config.key, "quantity", event.target.value)
                                }
                              />
                            </div>

                            <div className={styles.fieldColumn}>
                              <label className={styles.fieldLabel} htmlFor={`${config.key}-amount`}>
                                Amount
                              </label>
                              <input
                                id={`${config.key}-amount`}
                                className={getFieldInputClassName(styles.fieldInputMuted)}
                                value={formatAmount(pendingAmount)}
                                readOnly
                                aria-readonly="true"
                              />
                            </div>

                            <div className={`${styles.fieldColumn} ${styles.actionFieldColumn}`}>
                              <span className={styles.fieldLabel}>&nbsp;</span>
                              <div className={styles.inlineActionGroup}>
                                <button
                                  type="button"
                                  className={styles.inlinePrimaryButton}
                                  onClick={() => handleAddOrUpdateRow(config)}
                                >
                                  {isEditing ? "Update" : "Add"}
                                </button>
                                {isEditing ? (
                                  <button
                                    type="button"
                                    className={styles.inlineSecondaryButton}
                                    onClick={() => resetSectionDraft(config.key)}
                                  >
                                    Cancel
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </div>

                          <div className={styles.tableShell}>
                            <div className={styles.tableWrapper}>
                              <table className={styles.table}>
                                <thead>
                                  <tr>
                                    <th>{config.primaryLabel}</th>
                                    {showSecondaryColumn ? <th>{config.secondaryLabel}</th> : null}
                                    <th>Unit</th>
                                    <th>{config.rateLabel}</th>
                                    <th>No of unit</th>
                                    <th>Total</th>
                                    <th>Action</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {rows.length === 0 ? (
                                    <tr>
                                      <td
                                        className={styles.emptyState}
                                        colSpan={showSecondaryColumn ? 7 : 6}
                                      >
                                        No items added yet.
                                      </td>
                                    </tr>
                                  ) : (
                                    rows.map((row) => (
                                      <tr key={row.rowId}>
                                        <td>{row.itemName}</td>
                                        {showSecondaryColumn ? <td>{row.secondaryValue || "-"}</td> : null}
                                        <td>{row.unit || "-"}</td>
                                        <td className={styles.amountCell}>{formatAmount(row.rate)}</td>
                                        <td className={styles.amountCell}>
                                          {formatQuantity(row.quantity)}
                                        </td>
                                        <td className={styles.amountCell}>{formatAmount(row.total)}</td>
                                        <td>
                                          <div className={styles.actionGroup}>
                                            <button
                                              type="button"
                                              className={`${styles.actionButton} ${styles.editAction}`}
                                              onClick={() => handleEditRow(config, row)}
                                              aria-label={`Edit ${row.itemName}`}
                                              title={`Edit ${row.itemName}`}
                                            >
                                              <FaEdit />
                                            </button>
                                            <button
                                              type="button"
                                              className={`${styles.actionButton} ${styles.deleteAction}`}
                                              onClick={() => handleRemoveRow(config.key, row.rowId)}
                                              aria-label={`Remove ${row.itemName}`}
                                              title={`Remove ${row.itemName}`}
                                            >
                                              <FaTrashAlt />
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </>
                      )}

                      <div className={styles.sectionFooter}>
                        <span>{config.totalLabel}</span>
                        <strong>{formatAmount(sectionTotals[config.key])}</strong>
                      </div>
                    </section>
                  );
                })}

                <section className={styles.sectionCard}>
                  <div className={styles.sectionTitleRow}>
                    <h2 className={styles.sectionTitle}>Final Cost Summary</h2>
                  </div>

                  <div className={styles.summaryPanels}>
                    <div className={styles.summaryPanel}>
                      <h3 className={styles.summaryPanelTitle}>Cost Breakdown</h3>
                      <div className={styles.summaryPanelGrid}>
                        <div className={styles.fieldColumn}>
                          <label className={styles.fieldLabel} htmlFor="totalRawMaterialCost">
                            Total Raw Material Cost
                          </label>
                          <input
                            id="totalRawMaterialCost"
                            className={getFieldInputClassName(styles.fieldInputMuted)}
                            value={formatAmount(sectionTotals.raw_material)}
                            readOnly
                            aria-readonly="true"
                          />
                        </div>

                        <div className={styles.fieldColumn}>
                          <label className={styles.fieldLabel} htmlFor="totalProcessCost">
                            Total Service Cost
                          </label>
                          <input
                            id="totalProcessCost"
                            className={getFieldInputClassName(styles.fieldInputMuted)}
                            value={formatAmount(sectionTotals.manufacturing)}
                            readOnly
                            aria-readonly="true"
                          />
                        </div>

                        <div className={styles.fieldColumn}>
                          <label className={styles.fieldLabel} htmlFor="totalLaborCost">
                            Total Manpower Cost
                          </label>
                          <input
                            id="totalLaborCost"
                            className={getFieldInputClassName(styles.fieldInputMuted)}
                            value={formatAmount(sectionTotals.labor)}
                            readOnly
                            aria-readonly="true"
                          />
                        </div>

                        <div className={styles.fieldColumn}>
                          <label className={styles.fieldLabel} htmlFor="totalPackagingCost">
                            Total Transport Cost
                          </label>
                          <input
                            id="totalPackagingCost"
                            className={getFieldInputClassName(styles.fieldInputMuted)}
                            value={formatAmount(sectionTotals.packaging)}
                            readOnly
                            aria-readonly="true"
                          />
                        </div>

                        <div className={styles.fieldColumn}>
                          <label className={styles.fieldLabel} htmlFor="totalOverheadCost">
                            Total Overhead Cost
                          </label>
                          <input
                            id="totalOverheadCost"
                            className={getFieldInputClassName(styles.fieldInputMuted)}
                            value={formatAmount(sectionTotals.overhead)}
                            readOnly
                            aria-readonly="true"
                          />
                        </div>

                        <div className={styles.fieldColumn}>
                          <label className={styles.fieldLabel} htmlFor="totalMiscellaneousCost">
                            Total Miscellaneous Cost
                          </label>
                          <input
                            id="totalMiscellaneousCost"
                            className={getFieldInputClassName(styles.fieldInputMuted)}
                            value={formatAmount(sectionTotals.miscellaneous)}
                            readOnly
                            aria-readonly="true"
                          />
                        </div>

                        <div className={styles.fieldColumn}>
                          <label className={styles.fieldLabel} htmlFor="subtotal">
                            Subtotal
                          </label>
                          <input
                            id="subtotal"
                            className={getFieldInputClassName(styles.autoCalculatedInput)}
                            value={formatAmount(subtotal)}
                            readOnly
                            aria-readonly="true"
                          />
                        </div>
                      </div>
                    </div>

                    <div className={styles.summaryPanel}>
                      <h3 className={styles.summaryPanelTitle}>Final Calculation</h3>
                      <div className={styles.summaryPanelGrid}>
                        <div className={styles.fieldColumn}>
                          <label className={styles.fieldLabel} htmlFor="requestedQuantity">
                            Requested quantity
                          </label>
                          <input
                            id="requestedQuantity"
                            className={getFieldInputClassName(styles.fieldInputMuted)}
                            value={
                              selectedRequest
                                ? `${selectedRequest.quantity || 0} ${selectedRequest.unit || ""}`.trim()
                                : ""
                            }
                            readOnly
                            aria-readonly="true"
                          />
                        </div>

                        <div className={styles.fieldColumn}>
                          <label className={styles.fieldLabel} htmlFor="taxPercentage">
                            Tax (%)
                          </label>
                          <input
                            id="taxPercentage"
                            type="number"
                            min="0"
                            step="0.01"
                            className={getFieldInputClassName()}
                            value={FIXED_TAX_PERCENTAGE}
                            readOnly
                            aria-readonly="true"
                          />
                        </div>

                        <div className={styles.fieldColumn}>
                          <label className={styles.fieldLabel} htmlFor="taxAmount">
                            Tax Amount
                          </label>
                          <input
                            id="taxAmount"
                            className={getFieldInputClassName(styles.fieldInputMuted)}
                            value={formatAmount(taxAmount)}
                            readOnly
                            aria-readonly="true"
                          />
                        </div>

                        <div className={styles.fieldColumn}>
                          <label className={styles.fieldLabel} htmlFor="profitMarginPercentage">
                            Profit Margin (%)
                          </label>
                          <input
                            id="profitMarginPercentage"
                            type="number"
                            min="0"
                            step="0.01"
                            className={getFieldInputClassName()}
                            value={FIXED_PROFIT_MARGIN_PERCENTAGE}
                            readOnly
                            aria-readonly="true"
                          />
                        </div>

                        <div className={styles.fieldColumn}>
                          <label className={styles.fieldLabel} htmlFor="profitMarginAmount">
                            Profit Margin Amount
                          </label>
                          <input
                            id="profitMarginAmount"
                            className={getFieldInputClassName(styles.fieldInputMuted)}
                            value={formatAmount(profitMarginAmount)}
                            readOnly
                            aria-readonly="true"
                          />
                        </div>

                        <div className={styles.fieldColumn}>
                          <label className={styles.fieldLabel} htmlFor="finalBatteryCost">
                            Final Battery Cost
                          </label>
                          <input
                            id="finalBatteryCost"
                            className={getFieldInputClassName(styles.autoCalculatedInput)}
                            value={formatAmount(finalBatteryCost)}
                            readOnly
                            aria-readonly="true"
                          />
                        </div>

                        <div className={styles.fieldColumn}>
                          <label className={styles.fieldLabel} htmlFor="costPerUnit">
                            Cost per Unit
                          </label>
                          <input
                            id="costPerUnit"
                            className={getFieldInputClassName(styles.autoCalculatedInput)}
                            value={formatAmount(costPerUnit)}
                            readOnly
                            aria-readonly="true"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                </section>
                </div>
              </fieldset>

              <div className={styles.actionRow}>
                <button
                  type="submit"
                  className={styles.submitButton}
                  disabled={isSubmitting || isReadOnly}
                >
                  {isSubmitting ? "Saving..." : editingSheetId ? "Update" : "Submit"}
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
            </form>
          )}
        </section>
      </main>

      <ToastContainer position="top-right" autoClose={3000} />
    </>
  );
}
