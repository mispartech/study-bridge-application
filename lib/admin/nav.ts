import { can, roleOf, type Permission, type StaffRole, type WithMetadata } from "@/lib/auth/roles"

/** Remembers whether the sidebar is collapsed to icons. */
export const NAV_COOKIE = "sb-admin-nav"

/** Icon names, mapped to lucide icons in the sidebar, so this file stays free of React. */
export type NavIcon =
  | "home"
  | "overview"
  | "alerts"
  | "users"
  | "mail"
  | "feedback"
  | "review"
  | "flag"
  | "passport"
  | "currency"
  | "plane"
  | "payments"
  | "ai"
  | "advisor"
  | "settings"
  | "audit"
  | "system"
  | "diagnostics"
  | "pathways"

export type NavItem = { href: string; label: string; permission: Permission | null; icon: NavIcon }
export type NavGroup = { key: string; label: string; items: NavItem[] }

/**
 * Every admin page, grouped (docs/ADMIN_REVAMP_PLAN.md, Phase 1). Each page still checks its own permission on
 * the server; this list only decides what the sidebar offers. `permission: null` means any staff role.
 */
export const NAV: readonly NavGroup[] = [
  {
    key: "monitor",
    label: "Monitor",
    items: [
      { href: "/admin", label: "Home", permission: null, icon: "home" },
      { href: "/admin/overview", label: "Overview", permission: "overview", icon: "overview" },
      { href: "/admin/alerts", label: "Alerts", permission: "overview", icon: "alerts" },
    ],
  },
  {
    key: "students",
    label: "Students",
    items: [
      { href: "/admin/users", label: "Users", permission: "users.read", icon: "users" },
      { href: "/admin/emailed-reports", label: "Emailed reports", permission: "users.read", icon: "mail" },
      { href: "/admin/feedback", label: "Suggestions and feedback", permission: "overview", icon: "feedback" },
    ],
  },
  {
    key: "content",
    label: "Content and data",
    items: [
      { href: "/admin/review", label: "Review queue", permission: "content", icon: "review" },
      { href: "/admin/reports", label: "Error reports", permission: "content", icon: "flag" },
      { href: "/admin/visa-rules", label: "Visa rules", permission: "content", icon: "passport" },
      { href: "/admin/fx", label: "Exchange rates", permission: "content", icon: "currency" },
      { href: "/admin/estimates", label: "Flights and health", permission: "content", icon: "plane" },
    ],
  },
  {
    key: "money",
    label: "Money",
    items: [{ href: "/admin/payments", label: "Payments", permission: "payments", icon: "payments" }],
  },
  {
    key: "ai",
    label: "AI",
    items: [
      { href: "/admin/ai-usage", label: "AI usage", permission: "ai", icon: "ai" },
      { href: "/admin/advisor", label: "Advisor monitor", permission: "ai", icon: "advisor" },
    ],
  },
  {
    key: "system",
    label: "System",
    items: [
      { href: "/admin/settings", label: "Settings", permission: "settings", icon: "settings" },
      { href: "/admin/pathways", label: "Pathways", permission: "settings", icon: "pathways" },
      { href: "/admin/audit", label: "Audit log", permission: "audit", icon: "audit" },
      { href: "/admin/system", label: "System", permission: "settings", icon: "system" },
      { href: "/admin/diagnostics", label: "Diagnostics", permission: "settings", icon: "diagnostics" },
    ],
  },
]

/** Which home `/admin` shows: the Overview for admins, a support desk, or a content desk. */
export type Home = "overview" | "support" | "content"

export function homeFor(role: StaffRole): Home {
  if (role === "admin") return "overview"
  if (role === "support") return "support"
  return "content"
}

/**
 * The groups and pages this user can reach, empty groups dropped. For admins the home is the Overview, so
 * the separate Overview entry is folded into it.
 */
export function navFor(user: WithMetadata): NavGroup[] {
  const role = roleOf(user)
  if (!role) return []
  const overviewHome = homeFor(role) === "overview"
  return NAV.map((group) => ({
    ...group,
    items: group.items
      .filter((item) => item.permission === null || can(user, item.permission))
      .filter((item) => !(overviewHome && item.href === "/admin/overview"))
      .map((item) =>
        overviewHome && item.href === "/admin" ? { ...item, label: "Overview", icon: "overview" as const } : item
      ),
  })).filter((group) => group.items.length > 0)
}

/** The nav entry for a path: the longest href that is the path or a parent of it. */
export function activeHref(pathname: string, hrefs: readonly string[]): string | null {
  let best: string | null = null
  for (const href of hrefs) {
    const matches = href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`)
    if (matches && (best === null || href.length > best.length)) best = href
  }
  return best
}

/** Shown in the top bar, so nobody mistakes production for a preview. */
export function environmentLabel(vercelEnv: string | undefined): "Production" | "Preview" | "Local" {
  if (vercelEnv === "production") return "Production"
  if (vercelEnv === "preview") return "Preview"
  return "Local"
}
