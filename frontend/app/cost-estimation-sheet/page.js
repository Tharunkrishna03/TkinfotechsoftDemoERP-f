import CostEstimationSheetPageClient from "./client-page";

function getFirstSearchParamValue(value) {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

export default async function CostEstimationSheetPage({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const editingSheetId = getFirstSearchParamValue(resolvedSearchParams?.sheetId);
  const isRevisionMode = getFirstSearchParamValue(resolvedSearchParams?.revision) === "1";

  return (
    <CostEstimationSheetPageClient
      editingSheetId={editingSheetId}
      isRevisionMode={isRevisionMode}
    />
  );
}
