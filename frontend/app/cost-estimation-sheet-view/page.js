import CostEstimationSheetViewPageClient from "./client-page";

function getFirstSearchParamValue(value) {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

export default async function CostEstimationSheetViewPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const selectedSheetQueryId = getFirstSearchParamValue(resolvedSearchParams?.sheetId);

  return <CostEstimationSheetViewPageClient selectedSheetQueryId={selectedSheetQueryId} />;
}
