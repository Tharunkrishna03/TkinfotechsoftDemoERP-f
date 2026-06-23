import { NextResponse } from "next/server";

import { canAccessPath, getDefaultPathForUser } from "./lib/admin-access";
import { ADMIN_AUTH_COOKIE_NAME } from "./lib/admin-auth-constants";

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");

async function verifyToken(token) {
  try {
    const response = await fetch(`${API_BASE_URL}/api/admin-verify/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json().catch(() => null);
    return data?.user || null;
  } catch {
    return null;
  }
}

function redirectToLogin(request) {
  const response = NextResponse.redirect(new URL("/", request.url));
  response.cookies.delete(ADMIN_AUTH_COOKIE_NAME);
  return response;
}

function redirectToUserHome(request, user) {
  return NextResponse.redirect(new URL(getDefaultPathForUser(user), request.url));
}

export async function proxy(request) {
  const pathname = request.nextUrl.pathname;

  if (pathname === "/") {
    return NextResponse.next();
  }

  const authCookie = request.cookies.get(ADMIN_AUTH_COOKIE_NAME)?.value;
  if (!authCookie) {
    return redirectToLogin(request);
  }

  const authenticatedUser = await verifyToken(authCookie);
  if (!authenticatedUser) {
    return redirectToLogin(request);
  }

  if (!canAccessPath(authenticatedUser, pathname)) {
    return redirectToUserHome(request, authenticatedUser);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/sales-service/:path*",
    "/sales-service-view/:path*",
    "/sales/:path*",
    "/salesview/:path*",
    "/item/:path*",
    "/itemview/:path*",
    "/stock/:path*",
    "/cost-estimation-sheet/:path*",
    "/cost-estimation-sheet-view/:path*",
    "/cost-estimation-sheet-list/:path*",
    "/cost-estimation-sheet-hod-list/:path*",
    "/cost-estimation-sheet-md-list/:path*",
    "/quotation/:path*",
    "/quotation-list/:path*",
    "/quotation-hod-list/:path*",
    "/quotation-md-list/:path*",
    "/quote-after-hod-list/:path*",
    "/quote-after-md-list/:path*",
    "/purchase-order/:path*",
    "/purchase-order-list/:path*",
  ],
};
