"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { startTransition, useEffect, useRef, useState } from "react";
import {
  FiArrowLeft,
  FiBell,
  FiClipboard,
  FiCreditCard,
  FiFileText,
  FiGrid,
  FiLayers,
  FiLink2,
  FiLogOut,
  FiMenu,
  FiPackage,
  FiTool,
  FiUser,
  FiUsers,
} from "react-icons/fi";
import { FaCalculator, FaFileSignature, FaTimes } from "react-icons/fa";

import {
  ADMIN_ROLE,
  DOCUMENT_CONTROLLER_ROLE,
  LEAD_SALES_ROLE,
  OPERATION_HEAD_ROLE,
  SITE_ENGINEER_ROLE,
  canAccessPath,
  getUserRoles,
} from "@/lib/admin-access";
import { clearStoredAdminAuth, getStoredAdminAuth } from "@/lib/admin-auth";

import styles from "./admin-shell.module.css";

const NAV_ITEMS = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: FiGrid,
    matches: ["/dashboard"],
  },
  {
    label: "Sales",
    href: "/sales",
    icon: FiFileText,
    matches: ["/sales", "/salesview"],
  },
  {
    label: "Sales and service",
    href: "/sales-service",
    icon: FiTool,
    matches: [
      "/sales-service",
      "/sales-service-view",
      "/quotation",
      "/quotation-list",
      "/quotation-hod-list",
      "/quotation-md-list",
      "/quote-after-hod-list",
      "/quote-after-md-list",
      "/purchase-order",
      "/purchase-order-list",
      "/opening-job-card",
      "/job-card-list",
      "/job-card-hod-list",
      "/job-card-queue",
      "/operation-register",
      "/shopfloor-registration",
      "/operation-register-list",
      "/store-queue",
      "/work-queue",
      "/cost-estimation-sheet",
      "/cost-estimation-sheet-view",
      "/cost-estimation-sheet-list",
      "/cost-estimation-sheet-hod-list",
      "/cost-estimation-sheet-md-list",
    ],
    quickLinks: true,
  },
  {
    label: "Master",
    href: "/item",
    icon: FiLayers,
    matches: ["/item", "/itemview"],
  },
  {
    label: "Stock",
    href: "/stock",
    icon: FiPackage,
    matches: ["/stock"],
  },
];

const SALES_SERVICE_ROOT_QUICK_LINK_ITEMS = [
  {
    label: "Request for quatation",
    href: "/sales-service",
    icon: FaFileSignature,
  },
  {
    label: "Quotation",
    href: "/quotation",
    icon: FiFileText,
  },
  {
    label: "Purchase Order",
    href: "/purchase-order",
    icon: FiClipboard,
  },
  {
    label: "HOD",
    quickLinkView: "hod",
    icon: FiUsers,
  },
  {
    label: "MD",
    quickLinkView: "md",
    icon: FiUser,
  },
  {
    label: "Cost Estimation Sheet",
    href: "/cost-estimation-sheet",
    icon: FaCalculator,
  },
];

const HOD_QUICK_LINK_ITEMS = [
  {
    label: "HOD Cost Estimation",
    href: "/cost-estimation-sheet-hod-list",
    icon: FiUsers,
  },
  {
    label: "HOD Quotation",
    href: "/quotation-hod-list",
    icon: FiFileText,
  },
  {
    label: "Quote After HOD",
    href: "/quote-after-hod-list",
    icon: FiUsers,
  },
  {
    label: "HOD Job Card",
    href: "/job-card-hod-list",
    icon: FiClipboard,
  },
];

const MD_QUICK_LINK_ITEMS = [
  {
    label: "MD Cost Estimation",
    href: "/cost-estimation-sheet-md-list",
    icon: FiUser,
  },
  {
    label: "MD Quotation",
    href: "/quotation-md-list",
    icon: FiFileText,
  },
  {
    label: "Quote After MD",
    href: "/quote-after-md-list",
    icon: FiUser,
  },
];
const JOB_CARD_ROOT_LINKS = [
  {
    label: "Job Card",
    quickLinkView: "jobCard",
    icon: FiClipboard,
  },
];
const STORE_MANAGER_ONLY_QUICK_LINK_ITEMS = [
  {
    label: "Store Manager Queue",
    href: "/store-queue",
    icon: FiPackage,
  },
];
const SITE_ENGINEER_ONLY_QUICK_LINK_ITEMS = [
  {
    label: "Work Queue",
    href: "/work-queue",
    icon: FiClipboard,
  },
];
const JOB_CARD_QUICK_LINK_ITEMS = [
  {
    label: "Job Card Queue",
    href: "/job-card-queue",
    icon: FiClipboard,
  },
  {
    label: "Opening Job Card",
    href: "/opening-job-card",
    icon: FiFileText,
  },
  {
    label: "Store Manager",
    href: "/store-queue",
    icon: FiPackage,
  },
  {
    label: "Work Queue",
    href: "/work-queue",
    icon: FiClipboard,
  },
];
const ADMIN_QUICK_LINK_ITEMS = [...SALES_SERVICE_ROOT_QUICK_LINK_ITEMS, ...JOB_CARD_QUICK_LINK_ITEMS];

function matchesPath(pathname, item) {
  return item.matches.some((matchPath) => pathname === matchPath || pathname.startsWith(`${matchPath}/`));
}

export default function AdminShell({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [storedAuth, setStoredAuth] = useState(null);
  const currentUser = storedAuth?.user || null;
  const userRoles = getUserRoles(currentUser);
  const profileUsername = String(storedAuth?.user?.username || "").trim();
  const headerRef = useRef(null);
  const contentStackRef = useRef(null);
  const profileMenuRef = useRef(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSalesServiceQuickLinksOpen, setIsSalesServiceQuickLinksOpen] = useState(false);
  const [currentQuickLinksView, setCurrentQuickLinksView] = useState("salesService");
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [hasVerticalOverflow, setHasVerticalOverflow] = useState(null);
  const isAdminUser = userRoles.includes(ADMIN_ROLE);
  const isStoreManagerOnly =
    userRoles.length === 1 && userRoles.includes(OPERATION_HEAD_ROLE);
  const isSiteEngineerOnly =
    userRoles.length === 1 && userRoles.includes(SITE_ENGINEER_ROLE);
  const useJobCardShortcutLinks =
    !isStoreManagerOnly &&
    !isSiteEngineerOnly &&
    userRoles.some(
      (role) =>
        role === DOCUMENT_CONTROLLER_ROLE ||
        role === OPERATION_HEAD_ROLE ||
        role === SITE_ENGINEER_ROLE,
    ) &&
    !userRoles.some((role) => role === ADMIN_ROLE || role === LEAD_SALES_ROLE);
  const hodQuickLinks = HOD_QUICK_LINK_ITEMS.filter((item) =>
    canAccessPath(currentUser, item.href),
  );
  const mdQuickLinks = MD_QUICK_LINK_ITEMS.filter((item) =>
    canAccessPath(currentUser, item.href),
  );
  const jobCardQuickLinks = JOB_CARD_QUICK_LINK_ITEMS.filter((item) =>
    canAccessPath(currentUser, item.href),
  );
  const quickLinkItemsByView = {
    hod: hodQuickLinks,
    md: mdQuickLinks,
    jobCard: jobCardQuickLinks,
  };
  const salesServiceQuickLinks = (
    isStoreManagerOnly
      ? STORE_MANAGER_ONLY_QUICK_LINK_ITEMS
      : isSiteEngineerOnly
        ? SITE_ENGINEER_ONLY_QUICK_LINK_ITEMS
        : useJobCardShortcutLinks
      ? JOB_CARD_ROOT_LINKS
      : isAdminUser
        ? ADMIN_QUICK_LINK_ITEMS
        : SALES_SERVICE_ROOT_QUICK_LINK_ITEMS
  ).filter((item) => {
    if (item.href) {
      return canAccessPath(currentUser, item.href);
    }

    if (item.quickLinkView) {
      return (quickLinkItemsByView[item.quickLinkView] || []).length > 0;
    }

    return true;
  });
  const quickLinksConfig =
    currentQuickLinksView === "jobCard"
      ? {
          title: "Job Card",
          items: jobCardQuickLinks,
          showBack: true,
        }
      : currentQuickLinksView === "hod"
        ? {
            title: "HOD",
            items: hodQuickLinks,
            showBack: true,
          }
        : currentQuickLinksView === "md"
          ? {
              title: "MD",
              items: mdQuickLinks,
              showBack: true,
            }
          : {
              title: "Sales and service",
              items: salesServiceQuickLinks,
              showBack: false,
            };
  const visibleQuickLinks = salesServiceQuickLinks;
  const visibleNavItems = NAV_ITEMS.filter((item) =>
    item.quickLinks ? visibleQuickLinks.length > 0 : canAccessPath(currentUser, item.href),
  );

  useEffect(() => {
    setStoredAuth(getStoredAdminAuth());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    let animationFrameId = 0;
    let timeoutId = 0;

    const measureOverflow = () => {
      const contentStackElement = contentStackRef.current;
      const contentElement = contentStackElement?.parentElement;
      if (!contentStackElement || !contentElement) {
        return;
      }

      const contentStyles = window.getComputedStyle(contentElement);
      const contentPaddingTop = Number.parseFloat(contentStyles.paddingTop || "0");
      const contentPaddingBottom = Number.parseFloat(contentStyles.paddingBottom || "0");
      const headerHeight = headerRef.current?.offsetHeight || 0;
      const availableHeight = window.innerHeight - headerHeight - contentPaddingTop - contentPaddingBottom;
      const contentHeight = contentStackElement.getBoundingClientRect().height;
      const nextHasOverflow = contentHeight > availableHeight + 1;

      setHasVerticalOverflow((currentValue) =>
        currentValue === nextHasOverflow ? currentValue : nextHasOverflow
      );
    };

    const scheduleMeasure = () => {
      window.cancelAnimationFrame(animationFrameId);
      animationFrameId = window.requestAnimationFrame(measureOverflow);
    };

    scheduleMeasure();
    timeoutId = window.setTimeout(measureOverflow, 120);
    window.addEventListener("resize", scheduleMeasure);

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleMeasure);

    if (resizeObserver) {
      resizeObserver.observe(contentStackRef.current);
      resizeObserver.observe(contentStackRef.current.parentElement);
    }

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      window.clearTimeout(timeoutId);
      window.removeEventListener("resize", scheduleMeasure);
      resizeObserver?.disconnect();
    };
  }, [pathname]);

  useEffect(() => {
    if (!isProfileMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!profileMenuRef.current?.contains(event.target)) {
        setIsProfileMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setIsProfileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isProfileMenuOpen]);

  const handleOpenSalesServiceQuickLinks = () => {
    setIsSidebarOpen(false);
    setCurrentQuickLinksView("salesService");
    setIsSalesServiceQuickLinksOpen(true);
  };

  const handleNavigateFromQuickLinks = (href) => {
    setIsSalesServiceQuickLinksOpen(false);
    setCurrentQuickLinksView("salesService");
    router.push(href);
  };

  const handleQuickLinkSelection = (item) => {
    if (item.quickLinkView) {
      setCurrentQuickLinksView(item.quickLinkView);
      return;
    }

    handleNavigateFromQuickLinks(item.href);
  };

  const handleToggleProfileMenu = () => {
    setIsProfileMenuOpen((currentValue) => !currentValue);
  };

  const handleGoBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    if (pathname !== "/dashboard") {
      router.push("/dashboard");
      return;
    }

    router.push("/");
  };

  const handleLogout = () => {
    setStoredAuth(null);
    clearStoredAdminAuth();
    setIsSidebarOpen(false);
    setIsSalesServiceQuickLinksOpen(false);
    setCurrentQuickLinksView("salesService");
    setIsProfileMenuOpen(false);

    startTransition(() => {
      router.replace("/");
      router.refresh();
    });
  };

  return (
    <div className={styles.shell}>
      <aside
        className={`${styles.sidebar} ${isSidebarOpen ? styles.sidebarVisible : ""}`}
      >
        <div className={styles.brand}>
          <div className={styles.brandText}>
            <img src="/logo.png" className={styles.brandLogo} alt="TK Powers" />
          </div>
        </div>

        <nav className={styles.nav} aria-label="Sidebar navigation">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = matchesPath(pathname, item);

            if (item.quickLinks) {
              return (
                <button
                  key={item.href}
                  type="button"
                  className={`${styles.navLink} ${styles.navButton} ${
                    active ? styles.navLinkActive : ""
                  }`}
                  onClick={handleOpenSalesServiceQuickLinks}
                >
                  <span className={styles.navIcon}>
                    <Icon />
                  </span>
                  <span className={styles.navLabel}>{item.label}</span>
                </button>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
                onClick={() => setIsSidebarOpen(false)}
              >
                <span className={styles.navIcon}>
                  <Icon />
                </span>
                <span className={styles.navLabel}>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <button
        type="button"
        className={`${styles.sidebarBackdrop} ${isSidebarOpen ? styles.sidebarBackdropVisible : ""}`}
        onClick={() => setIsSidebarOpen(false)}
        aria-label="Close sidebar"
      />

      <div className={styles.workspace}>
        <header ref={headerRef} className={styles.header}>
          <div className={styles.headerStart}>
            <button
              type="button"
              className={styles.menuButton}
              onClick={() => setIsSidebarOpen((currentValue) => !currentValue)}
              aria-label="Toggle sidebar"
            >
              <FiMenu />
            </button>

            
          </div>

          <div className={styles.headerActions}>
            <button type="button" className={styles.headerAction} aria-label="Notifications">
              <FiBell />
              
            </button>
            <button type="button" className={styles.headerAction} aria-label="Team">
              <FiUsers />
            </button>
            <button type="button" className={styles.headerAction} aria-label="Billing">
              <FiCreditCard />
            </button>
            <button type="button" className={styles.headerAction} aria-label="Links">
              <FiLink2 />
            </button>
            <div ref={profileMenuRef} className={styles.profileMenuWrap}>
              <button
                type="button"
                className={styles.profileBadge}
                onClick={handleToggleProfileMenu}
                aria-label="Open user menu"
                aria-haspopup="menu"
                aria-expanded={isProfileMenuOpen}
              >
                <FiUser />
              </button>

              {isProfileMenuOpen ? (
                <div className={styles.profileMenu} role="menu" aria-label="User menu">
                  <div className={styles.profileMenuHeader}>
                    <div className={styles.profileMenuAvatar} aria-hidden="true">
                      <FiUser />
                    </div>
                    <p className={styles.profileMenuName}>
                      {profileUsername || "User"}
                    </p>
                  </div>

                  <div className={styles.profileMenuDivider} />

                  <button
                    type="button"
                    className={styles.profileMenuAction}
                    onClick={handleLogout}
                    role="menuitem"
                  >
                    <FiLogOut />
                    <span>Log Out</span>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <div className={styles.content}>
          <div ref={contentStackRef} className={styles.contentStack}>
            {hasVerticalOverflow === false ? (
              <div className={`${styles.backButtonRow} ${styles.backButtonRowTop}`}>
                <button
                  type="button"
                  className={styles.backButton}
                  onClick={handleGoBack}
                  aria-label="Go back"
                  title="Go back"
                >
                  <FiArrowLeft />
                </button>
              </div>
            ) : null}

            {children}

            {hasVerticalOverflow ? (
              <div className={`${styles.backButtonRow} ${styles.backButtonRowBottom}`}>
                <button
                  type="button"
                  className={styles.backButton}
                  onClick={handleGoBack}
                  aria-label="Go back"
                  title="Go back"
                >
                  <FiArrowLeft />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {isSalesServiceQuickLinksOpen ? (
        <div
          className={styles.quickLinksBackdrop}
          onClick={() => {
            setIsSalesServiceQuickLinksOpen(false);
            setCurrentQuickLinksView("salesService");
          }}
          role="presentation"
        >
          <div
            className={styles.quickLinksCard}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`${quickLinksConfig.title} quick links`}
          >
            <div className={styles.quickLinksHeader}>
              <div className={styles.quickLinksTitleWrap}>
                {quickLinksConfig.showBack ? (
                  <button
                    type="button"
                    className={styles.quickLinksBack}
                    onClick={() => setCurrentQuickLinksView("salesService")}
                    aria-label="Back to sales and service quick links"
                  >
                    <FiArrowLeft />
                  </button>
                ) : null}
                <h2>{quickLinksConfig.title}</h2>
              </div>
              <button
                type="button"
                className={styles.quickLinksClose}
                onClick={() => {
                  setIsSalesServiceQuickLinksOpen(false);
                  setCurrentQuickLinksView("salesService");
                }}
                aria-label={`Close ${quickLinksConfig.title.toLowerCase()} quick links`}
              >
                <FaTimes />
              </button>
            </div>

            <div className={styles.salesQuickLinksGrid}>
              {quickLinksConfig.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.href || item.label}
                    type="button"
                    className={styles.quickLinkButton}
                    onClick={() => handleQuickLinkSelection(item)}
                  >
                    <span className={styles.quickLinkIcon}>
                      <Icon />
                    </span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
