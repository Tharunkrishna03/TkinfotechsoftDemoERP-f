import {
  convertFromInr,
  formatCurrencyPrefix,
  getQuotationCodeDisplay,
  getQuotationDocumentTitle,
  shouldHideQuotationCode,
  toNumericValue,
} from "./shared";

const COMPANY_DETAILS = {
  name: "MAJESTIC SBCT L.L.C",
  gstin: "33AACFV3825E2ZG",
  phone: "+971 4 3244 313",
  email: "info@marinedubai.com",
  address: "Al Jaddaf  Dry docking ship yard Al Thani Building # 19 Office 19/6 first floor",
};

const COMPANY_LOGO_PATH = "/untitled-design32.png";

function formatMoneyFromInr(value, currency) {
  const safeCurrency = currency || {
    code: "INR",
    symbol: "Rs.",
    rateToInr: 1,
  };
  const precision = safeCurrency.code === "OMR" ? 3 : 2;
  return `${formatCurrencyPrefix(safeCurrency)}${convertFromInr(value, safeCurrency).toFixed(precision)}`;
}

function formatDateForPrint(value) {
  if (!value) {
    return "-";
  }

  const parsedDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parsedDate);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function getQuotationRevisionNumber(quotation) {
  const parsedValue = Number(
    quotation?.revisionNo ?? quotation?.revisedNo ?? 0,
  );
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

export function getQuotationCurrency(quotation) {
  return {
    name: quotation?.currencyName || "India",
    code: quotation?.currencyCode || "INR",
    symbol: quotation?.currencySymbol || "Rs.",
    rateToInr: toNumericValue(quotation?.currencyRateToInr) || 1,
    amountLabel: quotation?.currencyAmountLabel || "Rupees",
  };
}

function getScopeDetails(quotation) {
  const rfqScope = Array.isArray(quotation?.rfqScope) ? quotation.rfqScope : [];
  if (rfqScope.length) {
    return rfqScope;
  }
  return Array.isArray(quotation?.scopeDetails) ? quotation.scopeDetails : [];
}

function buildScopeRows(scopeDetails) {
  if (!scopeDetails.length) {
    return '<tr><td colspan="3" class="emptyCell">No RFQ scope available.</td></tr>';
  }

  return scopeDetails
    .map(
      (scopeDetail, index) =>
        `<tr><td>${index + 1}</td><td>${escapeHtml(scopeDetail)}</td><td class="amountCell">-</td></tr>`,
    )
    .join("");
}

export function buildQuotationPrintMarkup({ quotation, selectedCurrency }) {
  const scopeDetails = getScopeDetails(quotation);
  const currency = selectedCurrency || getQuotationCurrency(quotation);
  const validityLabel = `${quotation?.quoteValidityDays || 0} Days`;
  const contactModeLabel =
    quotation?.rfqContactMode === "email"
      ? "Email"
      : quotation?.rfqContactMode === "phone"
        ? "Phone"
        : quotation?.rfqContactMode || "-";
  const logoPath = escapeHtml(COMPANY_LOGO_PATH);
  const quotationCodeLine = shouldHideQuotationCode(quotation)
    ? ""
    : `<p class="muted">Quotation Code: ${escapeHtml(getQuotationCodeDisplay(quotation))}</p>`;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><title>${escapeHtml(
    getQuotationDocumentTitle(quotation, "Quotation"),
  )}</title><style>*{box-sizing:border-box}body{margin:0;padding:24px;font-family:Arial,sans-serif;color:#0f172a;background:#fff}.sheet{max-width:960px;margin:0 auto;border:1px solid #dce4ef;border-radius:16px;padding:24px}.header{display:flex;justify-content:space-between;align-items:center;gap:16px;border-bottom:1px solid #dce4ef;padding-bottom:16px;margin-bottom:16px}.brandLogo{width:100px;height:50px;object-fit:contain;flex-shrink:0}.titleBox{text-align:right}.titleBox h2{margin:0 0 8px;font-size:24px;letter-spacing:.06em}.detailsTopRow,.snapshotGrid,.termsGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-bottom:16px}.companyCard,.infoCard,.quotationCard,.termsCard,.snapshotCard{border:1px solid #dce4ef;border-radius:14px;padding:16px;background:#fff}.brandTitle{margin:0 0 6px;font-size:22px;color:#0f3f78}.muted{margin:2px 0;font-size:12px;color:#475569}.clientCardWrap{display:block}.companyCard,.clientCard{height:100%}.clientCard{width:100%}.infoCard h3,.quotationCard h3,.termsCard h4,.snapshotCard h4,.termsSection h4{margin:0 0 12px;font-size:14px}.infoRow{display:flex;justify-content:space-between;gap:12px;margin-bottom:8px;font-size:12px}.infoRow:last-child{margin-bottom:0}.infoRow span:first-child{color:#475569}.quotationGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 16px}.quotationCard{margin-bottom:20px}.tableCard{border:1px solid #dce4ef;border-radius:14px;padding:16px;background:#fff;margin-bottom:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #dce4ef;padding:10px 12px;font-size:12px;text-align:left;vertical-align:top}th,tfoot td{background:#f8fbff}.amountCell{text-align:right;white-space:nowrap}tfoot td{font-weight:700}.termsType{margin:0 0 10px;font-size:12px;font-weight:700;color:#0f3f78}.termsText,.sectionText,.snapshotText{margin:0;font-size:12px;line-height:1.6;white-space:pre-line}.termsSection{margin-bottom:20px}.signatureRow{margin-top:40px;display:flex;justify-content:space-between;align-items:flex-end;gap:24px;page-break-inside:avoid}.signatureLabel{margin:0;font-size:12px;color:#0f172a}.signatureBlock{text-align:center}.signatureStamp{width:80px;height:50px;object-fit:contain;display:block;margin:0 auto 6px}.emptyCell{text-align:center;color:#64748b}@media (max-width:720px){.header{flex-direction:column;align-items:flex-start}.titleBox{text-align:left}.detailsTopRow,.quotationGrid,.termsGrid,.snapshotGrid{grid-template-columns:1fr}}@media print{body{padding:0}.sheet{border:none;border-radius:0}}</style></head><body><div class="sheet"><div class="header"><img class="brandLogo" src="${logoPath}" alt="TK Power Source logo" /><div class="titleBox"><h2>QUOTATION</h2>${quotationCodeLine}<p class="muted">Revision No: ${escapeHtml(
    getQuotationRevisionNumber(quotation),
  )}</p></div></div><div class="detailsTopRow"><div class="companyCard"><h1 class="brandTitle">${escapeHtml(
    COMPANY_DETAILS.name,
  )}</h1><p class="muted">GSTIN: ${escapeHtml(COMPANY_DETAILS.gstin)}</p><p class="muted">Phone: ${escapeHtml(
    COMPANY_DETAILS.phone,
  )}</p><p class="muted">Email: ${escapeHtml(COMPANY_DETAILS.email)}</p><p class="muted">${escapeHtml(
    COMPANY_DETAILS.address,
  )}</p></div><div class="clientCardWrap"><div class="infoCard clientCard"><h3>Client Details</h3><div class="infoRow"><span>Attention</span><strong>${escapeHtml(
    quotation?.attentionName || "-",
  )}</strong></div><div class="infoRow"><span>Company</span><strong>${escapeHtml(
    quotation?.companyName || "-",
  )}</strong></div><div class="infoRow"><span>RFQ Ref</span><strong>${escapeHtml(
    quotation?.referenceNo || "-",
  )}</strong></div><div class="infoRow"><span>Cost Estimation</span><strong>${escapeHtml(
    quotation?.costEstimationNo || "-",
  )}</strong></div></div></div></div><div class="quotationCard"><h3>Quotation Details</h3><div class="quotationGrid"><div class="infoRow"><span>Quotation Date</span><strong>${escapeHtml(
    formatDateForPrint(quotation?.quotationDate),
  )}</strong></div><div class="infoRow"><span>Expiry Date</span><strong>${escapeHtml(
    formatDateForPrint(quotation?.expiryDate),
  )}</strong></div><div class="infoRow"><span>Quote Validity</span><strong>${escapeHtml(
    validityLabel,
  )}</strong></div><div class="infoRow"><span>Currency</span><strong>${escapeHtml(
    currency.code,
  )}</strong></div></div></div><div class="snapshotGrid"><div class="snapshotCard"><h4>RFQ Snapshot</h4><div class="infoRow"><span>Contact Mode</span><strong>${escapeHtml(
    contactModeLabel,
  )}</strong></div><p class="snapshotText">${escapeHtml(
    quotation?.rfqRemarks || "-",
  )}</p></div><div class="snapshotCard"><h4>Quotation Amount</h4><div class="infoRow"><span>Total</span><strong>${escapeHtml(
    formatMoneyFromInr(quotation?.totalCost, currency),
  )}</strong></div><div class="infoRow"><span>${escapeHtml(
    currency.amountLabel || "Amount",
  )}</span><strong>${escapeHtml(
    formatMoneyFromInr(quotation?.totalCost, currency),
  )}</strong></div></div></div><div class="tableCard"><h4>RFQ Scope</h4><table><thead><tr><th style="width:70px">#</th><th>Scope Details</th><th style="width:180px" class="amountCell">Estimated Amount</th></tr></thead><tbody>${buildScopeRows(
    scopeDetails,
  )}</tbody><tfoot><tr><td colspan="2">Total Amount of Cost Estimation</td><td class="amountCell">${escapeHtml(
    formatMoneyFromInr(quotation?.totalCost, currency),
  )}</td></tr></tfoot></table></div><div class="termsGrid"><div class="termsCard"><h4>Payment Terms</h4><p class="termsType">${escapeHtml(
    quotation?.paymentTermsType || "-",
  )}</p><p class="termsText">${escapeHtml(quotation?.paymentTerms || "-")}</p></div><div class="termsCard"><h4>Delivery Terms</h4><p class="termsType">${escapeHtml(
    quotation?.deliveryTermsType || "-",
  )}</p><p class="termsText">${escapeHtml(quotation?.deliveryTerms || "-")}</p></div><br/><br/></div><div class="termsSection"><h4>Terms and Conditions</h4><p class="termsType">${escapeHtml(
    quotation?.termsType || "-",
  )}</p><p class="sectionText">${escapeHtml(quotation?.terms || "-")}</p></div><br/><br/><br/><br/><br/><br/><br/><br/><div class="signatureRow"><p class="signatureLabel">Customer Signature</p><div class="signatureBlock"><img class="signatureStamp" src="${logoPath}" alt="Authorized signature stamp" /><p class="signatureLabel">Authorized Signature</p></div></div></div></body></html>`;
}
