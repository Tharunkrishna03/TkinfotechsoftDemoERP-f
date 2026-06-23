"use client";

import { Fragment, Suspense, useEffect, useRef, useState } from "react";
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

import styles from "./sales-service.module.css";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

const CONTACT_MODE_OPTIONS = [
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
];
const RFQ_TYPE_OPTIONS = [
  { value: "workshop", label: "Workshop" },
  { value: "spare", label: "Spare" },
  { value: "onsite", label: "Onsite" },
];
const RFQ_CATEGORY_OPTIONS = [
  { value: "standard", label: "Standard" },
  { value: "quote_of_assessment", label: "Quote of assessment" },
  { value: "quote_of_completion", label: "Quote of completion" },
];
const SALES_EXECUTIVE_OPTIONS = [
  { value: "sales_executive_1", label: "Sales Executive 1" },
  { value: "sales_executive_2", label: "Sales Executive 2" },
  { value: "sales_executive_3", label: "Sales Executive 3" },
];
const PLANNING_OPTIONS = [
  { value: "verbal", label: "Verbal" },
  { value: "quote_after", label: "Quote after completion" },
  { value: "quote_as_per_request", label: "standard" },
];
const LEGACY_BATTERY_SERVICE_OPTIONS = [
  "Battery Inspection",
  "Battery Installation",
  "Battery Testing",
  "Battery Maintenance",
  "Battery Repair",
  "Battery Replacement",
];
const BATTERY_SERVICE_OPTIONS = [
  "Surface Protection Coating",
  "Machining",
  "Yacht & Boat Services",
  "Electric Motor Repair Service",
  "GRP, GRE & HDPE Pipe Repairs",
  "Fabrication Works",
  "Mechanical Seal Repairing",
  "Laser Alignment & Line Boring",
  "NGP Cleaning & Flushing",
  "Pumps & Valves Overhauling",
  "Ship & Yard Repair Works",
  "Vibration Analysis & Dynamic Balancing",
  "Water & Waste Water Processing",
];
const SERVICE_SCOPE_OPTIONS = [...BATTERY_SERVICE_OPTIONS, ...LEGACY_BATTERY_SERVICE_OPTIONS];
const INITIAL_FORM_STATE = {
  referenceNo: "",
  rfqType: "",
  rfqCategory: "",
  salesExecutive: "",
  modeOfContact: "phone",
  emailReferenceNumber: "",
  requestDate: "",
  clientName: "",
  companyName: "",
  phoneNo: "",
  email: "",
  batteryServices: [],
  scopeArea: "",
  planningType: "",
  planStartDate: "",
  planEndDate: "",
  planningRemarks: "",
};

function normalizeFormValues(values = {}) {
  const candidateValues = values && typeof values === "object" ? values : {};

  return {
    ...INITIAL_FORM_STATE,
    referenceNo: String(candidateValues.referenceNo ?? INITIAL_FORM_STATE.referenceNo),
    rfqType: String(candidateValues.rfqType ?? INITIAL_FORM_STATE.rfqType),
    rfqCategory: String(candidateValues.rfqCategory ?? INITIAL_FORM_STATE.rfqCategory),
    salesExecutive: String(
      candidateValues.salesExecutive ?? INITIAL_FORM_STATE.salesExecutive,
    ),
    modeOfContact:
      candidateValues.modeOfContact === "email" || candidateValues.modeOfContact === "phone"
        ? candidateValues.modeOfContact
        : INITIAL_FORM_STATE.modeOfContact,
    emailReferenceNumber: String(
      candidateValues.emailReferenceNumber ?? INITIAL_FORM_STATE.emailReferenceNumber,
    ),
    requestDate: String(candidateValues.requestDate ?? INITIAL_FORM_STATE.requestDate),
    clientName: String(candidateValues.clientName ?? INITIAL_FORM_STATE.clientName),
    companyName: String(candidateValues.companyName ?? INITIAL_FORM_STATE.companyName),
    phoneNo: String(candidateValues.phoneNo ?? INITIAL_FORM_STATE.phoneNo),
    email: String(candidateValues.email ?? INITIAL_FORM_STATE.email),
    batteryServices: Array.isArray(candidateValues.batteryServices)
      ? candidateValues.batteryServices.filter(Boolean).map((serviceName) => String(serviceName))
      : [],
    scopeArea: String(candidateValues.scopeArea ?? INITIAL_FORM_STATE.scopeArea),
    planningType: String(candidateValues.planningType ?? INITIAL_FORM_STATE.planningType),
    planStartDate: String(candidateValues.planStartDate ?? INITIAL_FORM_STATE.planStartDate),
    planEndDate: String(candidateValues.planEndDate ?? INITIAL_FORM_STATE.planEndDate),
    planningRemarks: String(candidateValues.planningRemarks ?? INITIAL_FORM_STATE.planningRemarks),
  };
}

function getTodayValue() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().split("T")[0];
}

function splitScopeLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function buildScopeArea(services, currentScopeArea = "") {
  const manualLines = splitScopeLines(currentScopeArea).filter(
    (line) => !SERVICE_SCOPE_OPTIONS.includes(line),
  );
  const mergedLines = [...(Array.isArray(services) ? services : []), ...manualLines].filter(Boolean);

  return mergedLines.filter((line, index) => mergedLines.indexOf(line) === index).join("\n");
}

function shouldLockPlanningDates(rfqCategory) {
  return Boolean(rfqCategory) && rfqCategory !== "standard";
}

function isPdfFile(file) {
  if (!file) {
    return false;
  }

  const type = String(file.type || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();
  return type === "application/pdf" || name.endsWith(".pdf");
}

function isImageFile(file) {
  if (!file) {
    return false;
  }

  const type = String(file.type || "").toLowerCase();
  const name = String(file.name || "").toLowerCase();
  return (
    type.startsWith("image/") ||
    [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"].some((extension) =>
      name.endsWith(extension),
    )
  );
}

async function requestNextReference(requestDate) {
  const query = requestDate ? `?requestDate=${encodeURIComponent(requestDate)}` : "";
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/sales-service/next-reference/${query}`, {
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Failed to load the next reference number.");
  }

  return String(data?.referenceNo || "").trim();
}

async function requestSalesServiceDetail(id) {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/sales-service/${id}/`, {
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Failed to load request details.");
  }

  return data;
}

function mapServerErrors(data) {
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
}

function buildFormData(formValues, clientImage) {
  const payload = new FormData();

  Object.entries(formValues).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      payload.append(key, JSON.stringify(value));
      return;
    }

    payload.append(key, value ?? "");
  });

  if (clientImage) {
    payload.append("clientImage", clientImage);
  }

  return payload;
}

function SalesServicePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef(null);
  const editingRequestId = searchParams.get("requestId");
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [clientImage, setClientImage] = useState(null);
  const [existingAttachmentUrl, setExistingAttachmentUrl] = useState("");
  const [formValues, setFormValues] = useState(() =>
    normalizeFormValues({
      ...INITIAL_FORM_STATE,
      requestDate: getTodayValue(),
    }),
  );
  const normalizedFormValues = normalizeFormValues(formValues);
  const arePlanningDatesReadOnly = shouldLockPlanningDates(normalizedFormValues.rfqCategory);

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
    if (!isAuthorized || !editingRequestId) {
      return;
    }

    let isMounted = true;

    requestSalesServiceDetail(editingRequestId)
      .then((data) => {
        if (!isMounted) {
          return;
        }

        const batteryServices = Array.isArray(data.batteryServices) ? data.batteryServices : [];
        const nextModeOfContact =
          data.modeOfContact ||
          (data.emailReferenceNumber || data.email ? "email" : "phone");

        setFormValues(
          normalizeFormValues({
            ...INITIAL_FORM_STATE,
            referenceNo: data.referenceNo || "",
            rfqType: data.rfqType || "",
            rfqCategory: data.rfqCategory || "",
            salesExecutive: data.salesExecutive || "",
            modeOfContact: nextModeOfContact,
            emailReferenceNumber: data.emailReferenceNumber || "",
            requestDate: data.requestDate || getTodayValue(),
            clientName: data.clientName || "",
            companyName: data.companyName || "",
            phoneNo: data.phoneNo || "",
            email: data.email || "",
            batteryServices,
            scopeArea: data.scopeArea || buildScopeArea(batteryServices),
            planningType: data.planningType || "",
            planStartDate: data.planStartDate || "",
            planEndDate: data.planEndDate || "",
            planningRemarks: data.planningRemarks || "",
          }),
        );
        setClientImage(null);
        setExistingAttachmentUrl(data.clientImage || "");
        setErrors({});

        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      })
      .catch((error) => {
        if (isMounted) {
          toast.error(error.message || "Failed to load request details.");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [editingRequestId, isAuthorized]);

  useEffect(() => {
    if (!isAuthorized || editingRequestId || !formValues.requestDate) {
      return;
    }

    let isMounted = true;

    requestNextReference(formValues.requestDate)
      .then((referenceNo) => {
        if (isMounted) {
          setFormValues((currentValues) =>
            normalizeFormValues({
              ...currentValues,
              referenceNo,
            }),
          );
        }
      })
      .catch((error) => {
        if (isMounted) {
          toast.error(error.message || "Failed to load the next reference number.");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [editingRequestId, formValues.requestDate, isAuthorized]);

  const getFieldInputClassName = (fieldName, ...extraClasses) =>
    [styles.fieldInput, errors[fieldName] ? styles.fieldInputError : "", ...extraClasses]
      .filter(Boolean)
      .join(" ");

  const renderFieldError = (fieldName) =>
    errors[fieldName] ? (
      <p className={styles.fieldError}>{errors[fieldName]}</p>
    ) : null;

  const clearFieldErrors = (...fieldNames) => {
    setErrors((currentErrors) => {
      const nextErrors = { ...currentErrors };
      let hasChanges = false;

      fieldNames.forEach((fieldName) => {
        if (nextErrors[fieldName]) {
          delete nextErrors[fieldName];
          hasChanges = true;
        }
      });

      return hasChanges ? nextErrors : currentErrors;
    });
  };

  const resetAttachmentInput = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFieldChange = (event) => {
    const { name, value } = event.target;

    if (name === "rfqCategory") {
      setFormValues((currentValues) => {
        const nextValues = {
          ...currentValues,
          rfqCategory: value,
        };

        if (shouldLockPlanningDates(value)) {
          nextValues.planStartDate = currentValues.requestDate || getTodayValue();
          nextValues.planEndDate = currentValues.requestDate || getTodayValue();
        }

        return normalizeFormValues(nextValues);
      });
      clearFieldErrors("rfqCategory", "planStartDate", "planEndDate");
      return;
    }

    if (name === "modeOfContact") {
      setFormValues((currentValues) => ({
        ...normalizeFormValues({
          ...currentValues,
          modeOfContact: value,
          phoneNo: value === "email" ? "" : currentValues.phoneNo,
          email: value === "phone" ? "" : currentValues.email,
          emailReferenceNumber: value === "phone" ? "" : currentValues.emailReferenceNumber,
        }),
      }));
      setClientImage(null);
      setExistingAttachmentUrl("");
      resetAttachmentInput();
      clearFieldErrors("modeOfContact", "phoneNo", "email", "emailReferenceNumber", "clientImage");
      return;
    }

    if (name === "planStartDate" || name === "planEndDate") {
      if (shouldLockPlanningDates(normalizedFormValues.rfqCategory)) {
        return;
      }

      setFormValues((currentValues) =>
        normalizeFormValues({
          ...currentValues,
          [name]: value,
        }),
      );
      clearFieldErrors("planStartDate", "planEndDate");
      return;
    }

    setFormValues((currentValues) =>
      normalizeFormValues(
        name === "requestDate" && shouldLockPlanningDates(currentValues.rfqCategory)
          ? {
              ...currentValues,
              [name]: value,
              planStartDate: value,
              planEndDate: value,
            }
          : {
              ...currentValues,
              [name]: value,
            },
      ),
    );
    clearFieldErrors(name);
  };

  const handleImageChange = (event) => {
    setClientImage(event.target.files?.[0] || null);
    clearFieldErrors("clientImage");
  };

  const handleBatteryServiceToggle = (serviceName) => {
    setFormValues((currentValues) => {
      const safeCurrentValues = normalizeFormValues(currentValues);
      const isSelected = safeCurrentValues.batteryServices.includes(serviceName);
      const batteryServices = isSelected
        ? safeCurrentValues.batteryServices.filter(
            (currentService) => currentService !== serviceName,
          )
        : [...safeCurrentValues.batteryServices, serviceName];

      return normalizeFormValues({
        ...safeCurrentValues,
        batteryServices,
        scopeArea: buildScopeArea(batteryServices, safeCurrentValues.scopeArea),
      });
    });
    clearFieldErrors("batteryServices", "scopeArea");
  };

  const validateForm = () => {
    const currentFormValues = normalizeFormValues(formValues);
    const nextErrors = {};
    const trimmedReferenceNo = currentFormValues.referenceNo.trim();
    const trimmedClientName = currentFormValues.clientName.trim();
    const trimmedCompanyName = currentFormValues.companyName.trim();
    const trimmedPhoneNo = currentFormValues.phoneNo.trim();
    const trimmedEmail = currentFormValues.email.trim();
    const trimmedEmailReferenceNumber = currentFormValues.emailReferenceNumber.trim();
    const trimmedPlanningType = currentFormValues.planningType.trim();
    const hasAttachment = Boolean(clientImage || existingAttachmentUrl);

    if (!trimmedReferenceNo) {
      nextErrors.referenceNo = "Reference number is required.";
    }

    if (!currentFormValues.rfqType) {
      nextErrors.rfqType = "Select the RFQ type.";
    }

    if (!currentFormValues.rfqCategory) {
      nextErrors.rfqCategory = "Select the RFQ category.";
    }

    if (!currentFormValues.salesExecutive) {
      nextErrors.salesExecutive = "Select the sales executive.";
    }

    if (!currentFormValues.requestDate) {
      nextErrors.requestDate = "Date is required.";
    }

    if (!trimmedClientName) {
      nextErrors.clientName = "Client name is required.";
    }

    if (!trimmedCompanyName) {
      nextErrors.companyName = "Company name is required.";
    }

    if (currentFormValues.modeOfContact === "phone") {
      if (!trimmedPhoneNo) {
        nextErrors.phoneNo = "Phone number is required.";
      } else if (!/^[0-9+\-\s()]{7,20}$/.test(trimmedPhoneNo)) {
        nextErrors.phoneNo = "Enter a valid phone number.";
      }

      if (!hasAttachment) {
        nextErrors.clientImage = "Upload a screenshot file.";
      } else if (clientImage && !isImageFile(clientImage)) {
        nextErrors.clientImage = "Upload an image file only.";
      }
    } else if (currentFormValues.modeOfContact === "email") {
      if (!trimmedEmail) {
        nextErrors.email = "Email is required.";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        nextErrors.email = "Enter a valid email address.";
      }

      if (!trimmedEmailReferenceNumber) {
        nextErrors.emailReferenceNumber = "Email reference number is required.";
      }

      if (!hasAttachment) {
        nextErrors.clientImage = "Upload a PDF file.";
      } else if (clientImage && !isPdfFile(clientImage)) {
        nextErrors.clientImage = "Upload a PDF file only.";
      }
    }

    if (!trimmedPlanningType) {
      nextErrors.planningType = "Select the planning type.";
    }

    if (!currentFormValues.planStartDate) {
      nextErrors.planStartDate = "Plan start date is required.";
    }

    if (!currentFormValues.planEndDate) {
      nextErrors.planEndDate = "Plan end date is required.";
    } else if (
      currentFormValues.planStartDate &&
      currentFormValues.planEndDate < currentFormValues.planStartDate
    ) {
      nextErrors.planEndDate = "Plan end date cannot be before the plan start date.";
    }

    return nextErrors;
  };

  const resetForm = async () => {
    const requestDate = getTodayValue();
    const referenceNo = await requestNextReference(requestDate).catch(() => "");
    setFormValues(
      normalizeFormValues({
        ...INITIAL_FORM_STATE,
        requestDate,
        referenceNo,
      }),
    );
    setClientImage(null);
    setExistingAttachmentUrl("");
    setErrors({});
    resetAttachmentInput();
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
      const requestPayload = {
        ...normalizedFormValues,
        requestType: "service",
        scopeArea: buildScopeArea(
          normalizedFormValues.batteryServices,
          normalizedFormValues.scopeArea,
        ),
      };
      const payload = buildFormData(requestPayload, clientImage);

      const response = await fetchWithAdminAuth(
        editingRequestId
          ? `${API_BASE_URL}/api/sales-service/${editingRequestId}/`
          : `${API_BASE_URL}/api/sales-service/`,
        {
          method: editingRequestId ? "PUT" : "POST",
          body: payload,
        },
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        const serverErrors = mapServerErrors(data);
        if (Object.keys(serverErrors).length > 0) {
          setErrors(serverErrors);
          return;
        }

        throw new Error(data.error || "Failed to save the request.");
      }

      toast.success(
        editingRequestId
          ? "Request updated successfully"
          : data?.data?.referenceNo
            ? `${data.data.referenceNo} saved successfully`
            : "Request saved successfully",
      );

      if (editingRequestId) {
        router.push("/sales-service-view");
        return;
      }

      await resetForm();
    } catch (error) {
      toast.error(error.message || "Failed to save the request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (editingRequestId) {
      router.push("/sales-service-view");
      return;
    }

    resetForm().catch(() => {
      setFormValues({
        ...normalizeFormValues({
          ...INITIAL_FORM_STATE,
          requestDate: getTodayValue(),
        }),
      });
      setClientImage(null);
      setExistingAttachmentUrl("");
      setErrors({});
      resetAttachmentInput();
    });
  };

  if (isCheckingAuth || !isAuthorized) {
    return null;
  }

  return (
    <>
      <main className={styles.contentArea}>
        <section className={styles.card}>
          <div className={styles.sectionHeader}>
            <h2>Request for quatation</h2>
            <button
              type="button"
              className={styles.viewButton}
              onClick={() => router.push("/sales-service-view")}
              aria-label="Open request list"
              title="Open request list"
            >
              <FaThList />
            </button>
          </div>

          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.formGrid}>
              <section className={styles.sectionCard}>
                <div className={styles.sectionTitleRow}>
                  <h2 className={styles.sectionTitle}>Request for quatation</h2>
                </div>
                <div className={styles.sectionGrid}>
                  <div className={styles.fieldColumn}>
                    <label className={styles.fieldLabel} htmlFor="referenceNo">
                      RoQ Ref no
                    </label>
                    <input
                      id="referenceNo"
                      name="referenceNo"
                      className={getFieldInputClassName("referenceNo", styles.autoGeneratedInput)}
                      value={normalizedFormValues.referenceNo}
                      readOnly
                      aria-readonly="true"
                    />
                    {renderFieldError("referenceNo")}
                  </div>

                  <div className={styles.fieldColumn}>
                    <label className={styles.fieldLabel} htmlFor="requestDate">
                      ROQ date
                    </label>
                    <input
                      id="requestDate"
                      name="requestDate"
                      type="date"
                      className={getFieldInputClassName("requestDate", styles.fieldInputMuted)}
                      value={normalizedFormValues.requestDate}
                      readOnly
                      aria-readonly="true"
                    />
                    {renderFieldError("requestDate")}
                  </div>

                  <div className={styles.fieldColumn}>
                    <label className={styles.fieldLabel} htmlFor="rfqType">
                      RFQ type
                    </label>
                    <select
                      id="rfqType"
                      name="rfqType"
                      className={getFieldInputClassName("rfqType")}
                      value={normalizedFormValues.rfqType}
                      onChange={handleFieldChange}
                    >
                      <option value="">Select RFQ type</option>
                      {RFQ_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {renderFieldError("rfqType")}
                  </div>

                  <div className={styles.fieldColumn}>
                    <label className={styles.fieldLabel} htmlFor="rfqCategory">
                      RFQ category
                    </label>
                    <select
                      id="rfqCategory"
                      name="rfqCategory"
                      className={getFieldInputClassName("rfqCategory")}
                      value={normalizedFormValues.rfqCategory}
                      onChange={handleFieldChange}
                    >
                      <option value="">Select RFQ category</option>
                      {RFQ_CATEGORY_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {renderFieldError("rfqCategory")}
                  </div>

                  <div className={styles.fieldColumn}>
                    <label className={styles.fieldLabel} htmlFor="salesExecutive">
                      Sales executive
                    </label>
                    <select
                      id="salesExecutive"
                      name="salesExecutive"
                      className={getFieldInputClassName("salesExecutive")}
                      value={normalizedFormValues.salesExecutive}
                      onChange={handleFieldChange}
                    >
                      <option value="">Select sales executive</option>
                      {SALES_EXECUTIVE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {renderFieldError("salesExecutive")}
                  </div>
                </div>
              </section>

              <section className={styles.sectionCard}>
                <div className={styles.sectionTitleRow}>
                  <h2 className={styles.sectionTitle}>Client Details</h2>
                </div>
                <div className={styles.sectionGrid}>
                  <div className={styles.fieldColumn}>
                    <label className={styles.fieldLabel} htmlFor="modeOfContact">
                      Mode of contact
                    </label>
                    <select
                      id="modeOfContact"
                      name="modeOfContact"
                      className={getFieldInputClassName("modeOfContact")}
                      value={normalizedFormValues.modeOfContact}
                      onChange={handleFieldChange}
                    >
                      {CONTACT_MODE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {renderFieldError("modeOfContact")}
                  </div>

                  <div className={styles.fieldColumn}>
                    <label className={styles.fieldLabel} htmlFor="clientName">
                      Attention
                    </label>
                    <input
                      id="clientName"
                      name="clientName"
                      className={getFieldInputClassName("clientName")}
                      placeholder="Enter name"
                      value={normalizedFormValues.clientName}
                      onChange={handleFieldChange}
                    />
                    {renderFieldError("clientName")}
                  </div>

                  <div className={styles.fieldColumn}>
                    <label className={styles.fieldLabel} htmlFor="companyName">
                      Company name
                    </label>
                    <input
                      id="companyName"
                      name="companyName"
                      className={getFieldInputClassName("companyName")}
                      placeholder="Enter company name"
                      value={normalizedFormValues.companyName}
                      onChange={handleFieldChange}
                    />
                    {renderFieldError("companyName")}
                  </div>

                  {normalizedFormValues.modeOfContact === "phone" ? (
                    <Fragment key="phoneFields">
                      <div key="phoneNo" className={styles.fieldColumn}>
                        <label className={styles.fieldLabel} htmlFor="phoneNo">
                          Phone no
                        </label>
                        <input
                          id="phoneNo"
                          name="phoneNo"
                          className={getFieldInputClassName("phoneNo")}
                          placeholder="Enter phone number"
                          value={normalizedFormValues.phoneNo}
                          onChange={handleFieldChange}
                        />
                        {renderFieldError("phoneNo")}
                      </div>
                      

                      <div key="phoneAttachment" className={styles.fieldColumn}>
                        <label className={styles.fieldLabel} htmlFor="clientImage">
                          Upload screenshots
                        </label>
                        <input
                          id="clientImage"
                          name="clientImage"
                          ref={fileInputRef}
                          type="file"
                          accept="image/*,.png,.jpg,.jpeg,.webp,.bmp,.gif"
                          className={getFieldInputClassName("clientImage", styles.fileInput)}
                          onChange={handleImageChange}
                        />
                        {existingAttachmentUrl && !clientImage ? (
                          <p className={styles.fieldHint}>Current attachment is available.</p>
                        ) : null}
                        {renderFieldError("clientImage")}
                      </div>
                    </Fragment>
                  ) : (
                    <Fragment key="emailFields">
                      <div key="email" className={styles.fieldColumn}>
                        <label className={styles.fieldLabel} htmlFor="email">
                          Email
                        </label>
                        <input
                          id="email"
                          name="email"
                          type="email"
                          className={getFieldInputClassName("email")}
                          placeholder="Enter email"
                          value={normalizedFormValues.email}
                          onChange={handleFieldChange}
                        />
                        {renderFieldError("email")}
                      </div>

                      <div key="emailReferenceNumber" className={styles.fieldColumn}>
                        <label className={styles.fieldLabel} htmlFor="emailReferenceNumber">
                          Email reference number
                        </label>
                        <input
                          id="emailReferenceNumber"
                          name="emailReferenceNumber"
                          className={getFieldInputClassName("emailReferenceNumber")}
                          placeholder="Enter email reference number"
                          value={normalizedFormValues.emailReferenceNumber}
                          onChange={handleFieldChange}
                        />
                        {renderFieldError("emailReferenceNumber")}
                      </div>

                      <div key="emailAttachment" className={styles.fieldColumn}>
                        <label className={styles.fieldLabel} htmlFor="clientImage">
                          Upload file (.pdf)
                        </label>
                        <input
                          id="clientImage"
                          name="clientImage"
                          ref={fileInputRef}
                          type="file"
                          accept="application/pdf,.pdf"
                          className={getFieldInputClassName("clientImage", styles.fileInput)}
                          onChange={handleImageChange}
                        />
                        {existingAttachmentUrl && !clientImage ? (
                          <p className={styles.fieldHint}>Current attachment is available.</p>
                        ) : null}
                        {renderFieldError("clientImage")}
                      </div>
                    </Fragment>
                  )}
                </div>
              </section>

              <section className={styles.sectionCard}>
                <div className={styles.sectionTitleRow}>
                  <h2 className={styles.sectionTitle}>Service Details</h2>
                </div>
                <div className={styles.sectionGrid}>
                  <div className={`${styles.fieldColumn} ${styles.fieldSpanFull}`}>
                    <label className={styles.fieldLabel}>Marine related service</label>
                    <div className={styles.checkboxGrid}>
                      {BATTERY_SERVICE_OPTIONS.map((serviceName) => (
                        <label key={serviceName} className={styles.checkboxOption}>
                          <input
                            type="checkbox"
                            checked={normalizedFormValues.batteryServices.includes(serviceName)}
                            onChange={() => handleBatteryServiceToggle(serviceName)}
                          />
                          <span>{serviceName}</span>
                        </label>
                      ))}
                    </div>
                    {renderFieldError("batteryServices")}
                  </div>

                  <div className={`${styles.fieldColumn} ${styles.fieldSpanFull}`}>
                    <label className={styles.fieldLabel} htmlFor="scopeArea">
                      Scope area
                    </label>
                    <textarea
                      id="scopeArea"
                      name="scopeArea"
                      className={getFieldInputClassName("scopeArea", styles.scopeInput)}
                      value={normalizedFormValues.scopeArea}
                      placeholder="Add the service scope"
                      rows={4}
                      onChange={handleFieldChange}
                    />
                    {renderFieldError("scopeArea")}
                  </div>
                </div>
              </section>

              <section className={styles.sectionCard}>
                <div className={styles.sectionTitleRow}>
                  <h2 className={styles.sectionTitle}>Planning</h2>
                </div>
                <div className={styles.sectionGrid}>
                  <div className={styles.fieldColumn}>
                    <label className={styles.fieldLabel} htmlFor="planningType">
                      Planning
                    </label>
                    <select
                      id="planningType"
                      name="planningType"
                      className={getFieldInputClassName("planningType")}
                      value={normalizedFormValues.planningType}
                      onChange={handleFieldChange}
                    >
                      <option value="">Choose planning</option>
                      {PLANNING_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    {renderFieldError("planningType")}
                  </div>

                  <div className={styles.fieldColumn}>
                    <label className={styles.fieldLabel} htmlFor="planStartDate">
                      Plan start date
                    </label>
                    <input
                      id="planStartDate"
                      name="planStartDate"
                      type="date"
                      className={getFieldInputClassName("planStartDate")}
                      value={normalizedFormValues.planStartDate}
                      onChange={handleFieldChange}
                      readOnly={arePlanningDatesReadOnly}
                      disabled={arePlanningDatesReadOnly}
                    />
                    {renderFieldError("planStartDate")}
                  </div>

                  <div className={styles.fieldColumn}>
                    <label className={styles.fieldLabel} htmlFor="planEndDate">
                      Plan end date
                    </label>
                    <input
                      id="planEndDate"
                      name="planEndDate"
                      type="date"
                      className={getFieldInputClassName("planEndDate")}
                      value={normalizedFormValues.planEndDate}
                      onChange={handleFieldChange}
                      readOnly={arePlanningDatesReadOnly}
                      disabled={arePlanningDatesReadOnly}
                    />
                    {renderFieldError("planEndDate")}
                  </div>

                  <div className={`${styles.fieldColumn} ${styles.fieldSpanFull}`}>
                    <label className={styles.fieldLabel} htmlFor="planningRemarks">
                      Remarks
                    </label>
                    <textarea
                      id="planningRemarks"
                      name="planningRemarks"
                      className={getFieldInputClassName("planningRemarks", styles.scopeInput)}
                      placeholder="Add planning remarks"
                      value={normalizedFormValues.planningRemarks}
                      rows={4}
                      onChange={handleFieldChange}
                    />
                    {renderFieldError("planningRemarks")}
                  </div>
                </div>
              </section>
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
          </form>
        </section>
      </main>

      <ToastContainer position="top-right" autoClose={3000} />
    </>
  );
}

export default function SalesServicePage() {
  return (
    <Suspense fallback={null}>
      <SalesServicePageContent />
    </Suspense>
  );
}
