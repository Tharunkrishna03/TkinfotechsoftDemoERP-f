export const ADMIN_ROLE = "admin";
export const SALES_EXECUTIVE_ROLE = "sales_executive";
export const LEAD_SALES_ROLE = "lead_sales";
export const HOD_ROLE = "hod";
export const MD_ROLE = "md";
export const DOCUMENT_CONTROLLER_ROLE = "document_controller";
export const OPERATION_HEAD_ROLE = "operation_head";
export const SITE_ENGINEER_ROLE = "site_engineer";

const ALL_AUTHENTICATED_ROLES = [
  ADMIN_ROLE,
  SALES_EXECUTIVE_ROLE,
  LEAD_SALES_ROLE,
  HOD_ROLE,
  MD_ROLE,
  DOCUMENT_CONTROLLER_ROLE,
  OPERATION_HEAD_ROLE,
  SITE_ENGINEER_ROLE,
];

const PATH_ROLE_RULES = [
  { path: "/quotation-hod-list", roles: [ADMIN_ROLE, HOD_ROLE] },
  { path: "/quotation-md-list", roles: [ADMIN_ROLE, MD_ROLE] },
  { path: "/quote-after-hod-list", roles: [ADMIN_ROLE, HOD_ROLE] },
  { path: "/quote-after-md-list", roles: [ADMIN_ROLE, MD_ROLE] },
  {
    path: "/quotation/print",
    roles: [ADMIN_ROLE, LEAD_SALES_ROLE, HOD_ROLE, MD_ROLE, OPERATION_HEAD_ROLE],
  },
  { path: "/quotation-list", roles: [ADMIN_ROLE, LEAD_SALES_ROLE, OPERATION_HEAD_ROLE] },
  { path: "/quotation", roles: [ADMIN_ROLE, LEAD_SALES_ROLE] },
  { path: "/cost-estimation-sheet-hod-list", roles: [ADMIN_ROLE, HOD_ROLE] },
  { path: "/cost-estimation-sheet-md-list", roles: [ADMIN_ROLE, MD_ROLE] },
  { path: "/cost-estimation-sheet-list", roles: [ADMIN_ROLE, LEAD_SALES_ROLE] },
  {
    path: "/cost-estimation-sheet-view",
    roles: [ADMIN_ROLE, LEAD_SALES_ROLE, HOD_ROLE, MD_ROLE],
  },
  {
    path: "/cost-estimation-sheet",
    roles: [ADMIN_ROLE, LEAD_SALES_ROLE],
  },
  {
    path: "/sales-service-view",
    roles: [ADMIN_ROLE, SALES_EXECUTIVE_ROLE, LEAD_SALES_ROLE, OPERATION_HEAD_ROLE],
  },
  { path: "/sales-service", roles: [ADMIN_ROLE, SALES_EXECUTIVE_ROLE] },
  {
    path: "/purchase-order-list",
    roles: [ADMIN_ROLE, LEAD_SALES_ROLE, DOCUMENT_CONTROLLER_ROLE, OPERATION_HEAD_ROLE],
  },
  {
    path: "/purchase-order",
    roles: [ADMIN_ROLE, LEAD_SALES_ROLE, DOCUMENT_CONTROLLER_ROLE, OPERATION_HEAD_ROLE],
  },
  {
    path: "/job-card-queue",
    roles: [
      ADMIN_ROLE,
      LEAD_SALES_ROLE,
      DOCUMENT_CONTROLLER_ROLE,
      OPERATION_HEAD_ROLE,
      SITE_ENGINEER_ROLE,
    ],
  },
  {
    path: "/opening-job-card",
    roles: [
      ADMIN_ROLE,
      LEAD_SALES_ROLE,
      DOCUMENT_CONTROLLER_ROLE,
      OPERATION_HEAD_ROLE,
      SITE_ENGINEER_ROLE,
    ],
  },
  {
    path: "/job-card-list",
    roles: [ADMIN_ROLE, DOCUMENT_CONTROLLER_ROLE, OPERATION_HEAD_ROLE, SITE_ENGINEER_ROLE],
  },
  {
    path: "/job-card-hod-list",
    roles: [ADMIN_ROLE, HOD_ROLE],
  },
  {
    path: "/operation-register",
    roles: [ADMIN_ROLE, HOD_ROLE, SITE_ENGINEER_ROLE],
  },
  {
    path: "/shopfloor-registration",
    roles: [ADMIN_ROLE, SITE_ENGINEER_ROLE],
  },
  {
    path: "/operation-register-list",
    roles: [ADMIN_ROLE, HOD_ROLE],
  },
  {
    path: "/work-queue",
    roles: [ADMIN_ROLE, SITE_ENGINEER_ROLE],
  },
  {
    path: "/store-queue",
    roles: [ADMIN_ROLE, DOCUMENT_CONTROLLER_ROLE, OPERATION_HEAD_ROLE, SITE_ENGINEER_ROLE],
  },
  { path: "/dashboard", roles: ALL_AUTHENTICATED_ROLES },
  { path: "/sales", roles: [ADMIN_ROLE] },
  { path: "/salesview", roles: [ADMIN_ROLE] },
  { path: "/item", roles: [ADMIN_ROLE] },
  { path: "/itemview", roles: [ADMIN_ROLE] },
  { path: "/stock", roles: [ADMIN_ROLE] },
  { path: "/users", roles: [ADMIN_ROLE] },
];

function matchesPath(pathname, path) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function getUserRoles(user) {
  return Array.isArray(user?.roles) ? user.roles.filter(Boolean) : [];
}

export function hasAnyAllowedRole(user, allowedRoles) {
  const userRoles = getUserRoles(user);
  if (userRoles.includes(ADMIN_ROLE)) {
    return true;
  }
  return allowedRoles.some((role) => userRoles.includes(role));
}

export function getAllowedRolesForPath(pathname) {
  const normalizedPath = String(pathname || "").trim();
  const matchedRule = PATH_ROLE_RULES.find((rule) => matchesPath(normalizedPath, rule.path));
  return matchedRule?.roles || null;
}

export function canAccessPath(user, pathname) {
  const allowedRoles = getAllowedRolesForPath(pathname);
  if (!allowedRoles) {
    return true;
  }

  return hasAnyAllowedRole(user, allowedRoles);
}

export function getDefaultPathForUser(user) {
  const userRoles = getUserRoles(user);
  if (userRoles.length === 1 && userRoles.includes(OPERATION_HEAD_ROLE)) {
    return "/store-queue";
  }
  if (userRoles.length === 1 && userRoles.includes(SITE_ENGINEER_ROLE)) {
    return "/work-queue";
  }
  return userRoles.length ? "/dashboard" : "/";
}
