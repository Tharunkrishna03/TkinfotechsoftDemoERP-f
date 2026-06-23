"use client";

import { useEffect, useState } from "react";

import { canAccessPath, getDefaultPathForUser } from "@/lib/admin-access";
import {
  clearStoredAdminAuth,
  getStoredAdminAuth,
  saveAdminAuth,
  verifyAdminAccess,
} from "@/lib/admin-auth";

export function useAdminPageAccess(router) {
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

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
        const authPayload = await verifyAdminAccess(storedAuth.token);
        const nextUser = authPayload?.user || storedAuth.user || null;

        if (nextUser) {
          saveAdminAuth({
            token: storedAuth.token,
            user: nextUser,
          });
        }

        if (
          nextUser &&
          typeof window !== "undefined" &&
          !canAccessPath(nextUser, window.location.pathname)
        ) {
          if (isMounted) {
            setIsAuthorized(false);
            setIsCheckingAuth(false);
            router.replace(getDefaultPathForUser(nextUser));
          }
          return;
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

  return {
    isCheckingAuth,
    isAuthorized,
  };
}
