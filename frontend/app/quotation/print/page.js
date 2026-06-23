"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useAdminPageAccess } from "@/lib/use-admin-page-access";
import { requestQuotationDetail } from "../api";
import {
  buildQuotationPrintMarkup,
  getQuotationCurrency,
} from "../print-utils";

function QuotationPrintPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const quotationId = searchParams.get("id");
  const autoPrint = searchParams.get("autoprint") === "1";
  const frameRef = useRef(null);
  const hasAutoPrintedRef = useRef(false);
  const { isCheckingAuth, isAuthorized } = useAdminPageAccess(router);
  const [isLoading, setIsLoading] = useState(() => Boolean(quotationId));
  const [errorMessage, setErrorMessage] = useState("");
  const [quotation, setQuotation] = useState(null);

  useEffect(() => {
    if (!isAuthorized) {
      return;
    }

    if (!quotationId) {
      return;
    }

    let isMounted = true;

    requestQuotationDetail(quotationId)
      .then((data) => {
        if (isMounted) {
          setQuotation(data);
          setErrorMessage("");
        }
      })
      .catch((error) => {
        if (isMounted) {
          setErrorMessage(error.message || "Failed to load quotation.");
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isAuthorized, quotationId]);

  const previewMarkup = quotation
    ? buildQuotationPrintMarkup({
        quotation,
        selectedCurrency: getQuotationCurrency(quotation),
      })
    : "";

  if (isCheckingAuth || !isAuthorized) {
    return null;
  }

  if (!quotationId) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        Quotation id is required.
      </main>
    );
  }

  if (isLoading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          fontFamily: "Arial, sans-serif",
        }}
      >
        Loading quotation...
      </main>
    );
  }

  if (errorMessage) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          fontFamily: "Arial, sans-serif",
        }}
      >
        {errorMessage}
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "16px",
        background: "#f8fafc",
      }}
    >
      <iframe
        ref={frameRef}
        title="Quotation print preview"
        srcDoc={previewMarkup}
        onLoad={() => {
          if (!autoPrint || hasAutoPrintedRef.current) {
            return;
          }

          const previewWindow = frameRef.current?.contentWindow;
          if (!previewWindow) {
            return;
          }

          hasAutoPrintedRef.current = true;
          previewWindow.focus();
          previewWindow.print();
        }}
        style={{
          width: "100%",
          minHeight: "calc(100vh - 32px)",
          border: "1px solid #dce4ef",
          borderRadius: "16px",
          background: "#fff",
        }}
      />
    </main>
  );
}

export default function QuotationPrintPage() {
  return (
    <Suspense fallback={null}>
      <QuotationPrintPageContent />
    </Suspense>
  );
}
