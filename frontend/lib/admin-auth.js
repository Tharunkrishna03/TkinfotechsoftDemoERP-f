"use client";

import {
  ADMIN_AUTH_COOKIE_MAX_AGE_SECONDS,
  ADMIN_AUTH_COOKIE_NAME,
} from "@/lib/admin-auth-constants";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

const ADMIN_AUTH_STORAGE_KEY = "admin.auth";
const REMEMBERED_LOGIN_NAME_KEY = "admin.loginName";

function isBrowser() {
  return typeof window !== "undefined";
}

function writeCookie(name, value, maxAgeSeconds) {
  if (!isBrowser()) {
    return;
  }

  const encodedValue = encodeURIComponent(value);
  const maxAgePart =
    typeof maxAgeSeconds === "number" ? `; max-age=${maxAgeSeconds}` : "";

  document.cookie = `${name}=${encodedValue}; path=/; SameSite=Lax${maxAgePart}`;
}

function deleteCookie(name) {
  if (!isBrowser()) {
    return;
  }

  document.cookie = `${name}=; path=/; max-age=0; SameSite=Lax`;
}

async function postJson(path, payload) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

export async function loginAdmin(credentials) {
  return postJson("/api/admin-login/", credentials);
}

export async function verifyAdminAccess(token) {
  return postJson("/api/admin-verify/", { token });
}

export function getStoredAdminToken() {
  return String(getStoredAdminAuth()?.token || "").trim();
}

export function buildAdminAuthHeaders(headers = {}) {
  const nextHeaders = new Headers(headers);
  const token = getStoredAdminToken();

  if (token) {
    nextHeaders.set("Authorization", `Bearer ${token}`);
  }

  return nextHeaders;
}

export function fetchWithAdminAuth(input, init = {}) {
  return fetch(input, {
    ...init,
    headers: buildAdminAuthHeaders(init.headers),
  });
}

export function saveAdminAuth(authPayload) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(
    ADMIN_AUTH_STORAGE_KEY,
    JSON.stringify({
      token: authPayload.token,
      user: authPayload.user,
    }),
  );

  if (authPayload?.token) {
    writeCookie(
      ADMIN_AUTH_COOKIE_NAME,
      authPayload.token,
      ADMIN_AUTH_COOKIE_MAX_AGE_SECONDS,
    );
  }
}

export function getStoredAdminAuth() {
  if (!isBrowser()) {
    return null;
  }

  const rawValue = window.localStorage.getItem(ADMIN_AUTH_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue);
  } catch {
    window.localStorage.removeItem(ADMIN_AUTH_STORAGE_KEY);
    return null;
  }
}

export function clearStoredAdminAuth() {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(ADMIN_AUTH_STORAGE_KEY);
  deleteCookie(ADMIN_AUTH_COOKIE_NAME);
}

export function rememberLoginName(loginName) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(REMEMBERED_LOGIN_NAME_KEY, loginName);
}

export function getRememberedLoginName() {
  if (!isBrowser()) {
    return "";
  }

  return window.localStorage.getItem(REMEMBERED_LOGIN_NAME_KEY) || "";
}

export function clearRememberedLoginName() {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(REMEMBERED_LOGIN_NAME_KEY);
}
