import { getApiErrorMessage } from "./shared";
import { fetchWithAdminAuth } from "@/lib/admin-auth";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

async function readJson(response, fallbackValue) {
  return response.json().catch(() => fallbackValue);
}

function sortQuotations(rows) {
  return [...rows].sort((firstRow, secondRow) => {
    const secondTime = new Date(secondRow?.created_at || 0).getTime();
    const firstTime = new Date(firstRow?.created_at || 0).getTime();

    if (
      Number.isFinite(secondTime) &&
      Number.isFinite(firstTime) &&
      secondTime !== firstTime
    ) {
      return secondTime - firstTime;
    }

    return Number(secondRow?.id || 0) - Number(firstRow?.id || 0);
  });
}

export async function requestQuotationCatalog() {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/quotation/catalog/`, {
    cache: "no-store",
  });
  const data = await readJson(response, {});

  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, "Failed to load quotation catalog."));
  }

  return Array.isArray(data.requests) ? data.requests : [];
}

export async function requestNextQuotationNumber(quotationDate) {
  const queryParams = new URLSearchParams();

  if (quotationDate) {
    queryParams.set("quotationDate", quotationDate);
  }

  const query = queryParams.toString();
  const response = await fetchWithAdminAuth(
    `${API_BASE_URL}/api/quotation/next-number/${query ? `?${query}` : ""}`,
    {
      cache: "no-store",
    },
  );
  const data = await readJson(response, {});

  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, "Failed to load quotation number."));
  }

  return String(data.quotationCode || "").trim();
}

export async function requestQuotationPreview(payload) {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/quotation/preview/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await readJson(response, {});

  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, "Failed to generate quotation preview."));
  }

  return data;
}

export async function requestQuotationDetail(id) {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/quotation/${id}/`, {
    cache: "no-store",
  });
  const data = await readJson(response, {});

  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, "Failed to load quotation."));
  }

  return data;
}

export async function saveQuotation(payload) {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/quotation/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await readJson(response, {});

  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, "Failed to save quotation."));
  }

  return data;
}

export async function requestQuotations(workflow, filters = {}) {
  const queryParams = new URLSearchParams();
  if (workflow) {
    queryParams.set("workflow", workflow);
  }
  if (filters.planningType) {
    queryParams.set("planningType", filters.planningType);
  }

  const query = queryParams.toString();
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/quotation/${query ? `?${query}` : ""}`, {
    cache: "no-store",
  });
  const data = await readJson(response, []);

  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, "Failed to load quotations."));
  }

  return sortQuotations(Array.isArray(data) ? data : []);
}

export async function sendQuotationToHead(id) {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/quotation/${id}/send-to-head/`, {
    method: "POST",
  });
  const data = await readJson(response, {});

  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, "Failed to send quotation to HOD."));
  }

  return data;
}

export async function submitQuotationReview(id, payload) {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/quotation/${id}/review/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await readJson(response, {});

  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, "Failed to save quotation review."));
  }

  return data;
}

export async function submitQuotationClientResponse(id, payload) {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/quotation/${id}/client-response/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await readJson(response, {});

  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, "Failed to save client response."));
  }

  return data;
}

export async function deleteQuotation(id) {
  const response = await fetchWithAdminAuth(`${API_BASE_URL}/api/quotation/${id}/`, {
    method: "DELETE",
  });
  const data = await readJson(response, {});

  if (!response.ok) {
    throw new Error(getApiErrorMessage(data, "Failed to delete quotation."));
  }

  return data;
}
