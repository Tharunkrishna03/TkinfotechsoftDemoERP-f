"use client";

import QuotationApprovalList from "@/components/quotation-approval-list";

export default function QuoteAfterMdListPage() {
  return (
    <QuotationApprovalList
      stage="md"
      planningType="quote_after"
      title="Quote After MD List"
    />
  );
}
