"use client";

const PURCHASE_ORDER_NOTIFICATION_KEY = "workflow.purchase-order.notification";

function isBrowser() {
  return typeof window !== "undefined";
}

export function savePurchaseOrderNotification(notification) {
  if (!isBrowser() || !notification || typeof notification !== "object") {
    return;
  }

  window.localStorage.setItem(
    PURCHASE_ORDER_NOTIFICATION_KEY,
    JSON.stringify({
      quotationId: notification.quotationId || null,
      quotationCode: notification.quotationCode || "",
      purchaseOrderNo: notification.purchaseOrderNo || "",
      createdAt: notification.createdAt || new Date().toISOString(),
    }),
  );
}

export function readPurchaseOrderNotification() {
  if (!isBrowser()) {
    return null;
  }

  const rawValue = window.localStorage.getItem(PURCHASE_ORDER_NOTIFICATION_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue);
  } catch {
    window.localStorage.removeItem(PURCHASE_ORDER_NOTIFICATION_KEY);
    return null;
  }
}

export function clearPurchaseOrderNotification() {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.removeItem(PURCHASE_ORDER_NOTIFICATION_KEY);
}
