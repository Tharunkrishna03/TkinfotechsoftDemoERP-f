"use client";

import QuotationApprovalList from "@/components/quotation-approval-list";

export default function QuoteAfterHodListPage() {
  return (
    <QuotationApprovalList
      stage="hod"
      planningType="quote_after"
      title="Quote After HOD List"
    />
  );
}
