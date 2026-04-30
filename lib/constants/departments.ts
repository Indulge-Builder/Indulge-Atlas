/**
 * lib/constants/departments.ts
 *
 * Single source of truth for all department and domain configuration.
 * All components, Server Actions, and navigation logic MUST import from here.
 * Never inline DEPARTMENT_CONFIG or DOMAIN_CONFIG inside components.
 *
 * Two-axis access control model:
 *   AXIS 1: domain      → "What DATA can you see?"      (Row-Level Security)
 *   AXIS 2: department  → "What SCREENS can you open?"  (UI Routing)
 */

import type { EmployeeDepartment, IndulgeDomain } from "@/lib/types/database";

// ── Department Configuration ─────────────────────────────────

export interface DepartmentConfig {
  /** Display label e.g. "Concierge" */
  label: string;
  /** One-line description shown in the department selection card */
  description: string;
  /** Lucide icon name (string) for dynamic rendering */
  icon: string;
  /** Brand accent color for active states and highlights */
  accentColor: string;
  /** The domain that is pre-selected when this department is chosen */
  primaryDomain: IndulgeDomain;
  /**
   * All domain values that make sense for this department.
   * Shown in the domain segmented control after department is chosen.
   */
  allowedDomains: IndulgeDomain[];
  /** The primary workspace route for this department */
  workspaceRoute: string;
}

export const DEPARTMENT_CONFIG: Record<EmployeeDepartment, DepartmentConfig> = {
  concierge: {
    label: "Concierge",
    description: "Luxury lifestyle concierge & inbound sales",
    icon: "Sparkles",
    accentColor: "#4F46E5",
    primaryDomain: "indulge_concierge",
    allowedDomains: ["indulge_concierge"],
    workspaceRoute: "/workspace",
  },
  finance: {
    label: "Finance",
    description: "Financial operations, billing & analytics",
    icon: "TrendingUp",
    accentColor: "#D4AF37",
    primaryDomain: "indulge_global",
    allowedDomains: ["indulge_global", "indulge_concierge"],
    workspaceRoute: "/",
  },
  tech: {
    label: "Tech",
    description: "Engineering, platform & infrastructure",
    icon: "Code2",
    accentColor: "#0D9488",
    primaryDomain: "indulge_global",
    allowedDomains: ["indulge_global"],
    workspaceRoute: "/tasks",
  },
  shop: {
    label: "Shop",
    description: "E-commerce operations & product sales",
    icon: "ShoppingBag",
    accentColor: "#10B981",
    primaryDomain: "indulge_shop",
    allowedDomains: ["indulge_shop"],
    workspaceRoute: "/shop/workspace",
  },
  house: {
    label: "House",
    description: "Property, real estate & lifestyle experiences",
    icon: "Home",
    accentColor: "#A88B25",
    primaryDomain: "indulge_house",
    allowedDomains: ["indulge_house"],
    workspaceRoute: "/workspace",
  },
  legacy: {
    label: "Legacy",
    description: "Long-term membership & legacy client management",
    icon: "Award",
    accentColor: "#6B7280",
    primaryDomain: "indulge_legacy",
    allowedDomains: ["indulge_legacy"],
    workspaceRoute: "/workspace",
  },
  marketing: {
    label: "Marketing",
    description: "Campaign management, brand & digital growth",
    icon: "Megaphone",
    accentColor: "#8B5CF6",
    primaryDomain: "indulge_global",
    allowedDomains: ["indulge_global", "indulge_concierge"],
    workspaceRoute: "/manager/campaigns",
  },
  onboarding: {
    label: "Onboarding",
    description: "Client onboarding, conversion & retention",
    icon: "UserCheck",
    accentColor: "#4F46E5",
    primaryDomain: "indulge_concierge",
    allowedDomains: ["indulge_concierge"],
    workspaceRoute: "/admin/onboarding",
  },
};

// ── Domain Configuration ─────────────────────────────────────

export interface DomainConfig {
  /** Full display label */
  label: string;
  /** One-line description shown in the domain selector */
  description: string;
  /** Pill background color */
  pillBg: string;
  /** Pill text color */
  pillColor: string;
}

export const DOMAIN_CONFIG: Record<IndulgeDomain, DomainConfig> = {
  indulge_concierge: {
    label: "Indulge Concierge",
    description: "Primary luxury concierge & inbound sales data",
    pillBg: "#EEF2FF",
    pillColor: "#4F46E5",
  },
  indulge_shop: {
    label: "Indulge Shop",
    description: "E-commerce & product sales data",
    pillBg: "#D1FAE5",
    pillColor: "#0D9488",
  },
  indulge_house: {
    label: "Indulge House",
    description: "Property & lifestyle experience data",
    pillBg: "#FEF3C7",
    pillColor: "#A88B25",
  },
  indulge_legacy: {
    label: "Indulge Legacy",
    description: "Legacy client & membership data",
    pillBg: "#F4F4F5",
    pillColor: "#6B7280",
  },
  indulge_global: {
    label: "Indulge Global",
    description: "Cross-business-unit access — sees data across all domains",
    pillBg: "#FFF7ED",
    pillColor: "#D4AF37",
  },
};

/**
 * Normalize `profiles.domain` (or any string) to a valid `IndulgeDomain`.
 * Invalid or empty values become `indulge_concierge` so domain-scoped helpers
 * (e.g. Task Insights `departmentsVisibleForDomain`) never return an empty list.
 */
export function coerceIndulgeDomain(raw: string | null | undefined): IndulgeDomain {
  const v = (raw ?? "").trim();
  const keys = Object.keys(DOMAIN_CONFIG) as IndulgeDomain[];
  if (keys.includes(v as IndulgeDomain)) return v as IndulgeDomain;
  return "indulge_concierge";
}

// ── Department Route Access Map ──────────────────────────────
//
// Defines which route prefixes each department can navigate to.
// Used by the Sidebar to filter nav items for non-admin/founder users.
// "/" is treated as an EXACT match to avoid matching all routes.

export const DEPARTMENT_ROUTE_ACCESS: Record<EmployeeDepartment, string[]> = {
  concierge: [
    "/",
    "/workspace",
    "/leads",
    "/whatsapp",
    "/tasks",
    "/task-insights",
    "/calendar",
    "/performance",
    "/conversions",
    "/escalations",
  ],
  finance: [
    "/workspace",
    "/leads",
    "/tasks",
    "/calendar",
    "/manager/campaigns",
    "/manager/dashboard",
    "/task-insights",
    "/manager",
  ],
  tech: [
    "/workspace",
    "/leads",
    "/tasks",
    "/tasks/import",
    "/task-insights",
    "/calendar",
    "/admin/integrations",
    "/admin/mappings",
    "/admin/routing",
  ],
  shop: [
    "/shop/workspace",
    "/workspace",
    "/leads",
    "/tasks",
    "/task-insights",
    "/calendar",
    "/whatsapp",
  ],
  house: [
    "/",
    "/workspace",
    "/leads",
    "/whatsapp",
    "/tasks",
    "/task-insights",
    "/calendar",
    "/performance",
    "/conversions",
    "/escalations",
  ],
  legacy: [
    "/",
    "/workspace",
    "/leads",
    "/whatsapp",
    "/tasks",
    "/task-insights",
    "/calendar",
    "/performance",
    "/conversions",
    "/escalations",
  ],
  marketing: [
    "/workspace",
    "/leads",
    "/tasks",
    "/calendar",
    "/manager/campaigns",
    "/manager/planner",
    "/manager/dashboard",
    "/manager/team",
    "/task-insights",
    "/manager",
  ],
  onboarding: [
    "/",
    "/workspace",
    "/leads",
    "/whatsapp",
    "/tasks",
    "/tasks/import",
    "/task-insights",
    "/calendar",
    "/conversions",
    "/admin/onboarding",
  ],
};

// ── Helpers ──────────────────────────────────────────────────

/** Returns the pre-selected domain for a given department. */
export function getDefaultDomainForDepartment(dept: EmployeeDepartment): IndulgeDomain {
  return DEPARTMENT_CONFIG[dept].primaryDomain;
}

/** All department keys in display order. */
export const ALL_DEPARTMENTS: EmployeeDepartment[] = [
  "concierge",
  "finance",
  "tech",
  "shop",
  "house",
  "legacy",
  "marketing",
  "onboarding",
];

/**
 * Check whether a given route href falls within a department's accessible routes.
 * Exact match for "/" to avoid matching everything.
 */
export function isDepartmentRoute(href: string, routes: string[]): boolean {
  return routes.some((route) => {
    if (route === "/") return href === "/";
    return href === route || href.startsWith(route + "/");
  });
}

/**
 * Departments whose primary or allowed domain matches the user's domain.
 * Used by managers for Task Insights and similar domain-scoped surfaces.
 */
export function departmentsVisibleForDomain(domain: IndulgeDomain): EmployeeDepartment[] {
  return ALL_DEPARTMENTS.filter(
    (d) =>
      DEPARTMENT_CONFIG[d].primaryDomain === domain ||
      DEPARTMENT_CONFIG[d].allowedDomains.includes(domain),
  );
}
