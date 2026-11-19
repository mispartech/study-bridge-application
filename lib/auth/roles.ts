/**
 * Staff roles (docs/SPEC_ACCESS_ADMIN.md, section 3). Everyone else is a student. The role lives in
 * app_metadata, which only the service key can set, unlike user_metadata, which students can edit.
 */
export const STAFF_ROLES = ["support", "data_editor", "admin"] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

export type Permission =
  | "users.read" // users, their activity and reports
  | "users.manage" // suspend, resend links and reports
  | "content" // review queue, programmes, error reports, visa rules, exchange rates, estimates
  | "roles" // change who is staff
  | "settings" // models, prices, limits, diagnostics
  | "ai" // AI usage and cost
  | "payments"
  | "audit" // the staff audit log

const GRANTS: Record<StaffRole, readonly Permission[]> = {
  support: ["users.read", "users.manage"],
  data_editor: ["content"],
  admin: ["users.read", "users.manage", "content", "roles", "settings", "ai", "payments", "audit"],
}

export const ROLE_LABEL: Record<StaffRole | "student", string> = {
  student: "Student",
  support: "Support",
  data_editor: "Data editor",
  admin: "Admin",
}

type WithMetadata =
  { app_metadata?: Record<string, unknown>; user_metadata?: Record<string, unknown> } | null | undefined

export function roleOf(user: WithMetadata): StaffRole | null {
  const role = user?.app_metadata?.role
  return STAFF_ROLES.includes(role as StaffRole) ? (role as StaffRole) : null
}

export const isStaff = (user: WithMetadata) => roleOf(user) !== null
export const isAdmin = (user: WithMetadata) => roleOf(user) === "admin"

export function can(user: WithMetadata, permission: Permission): boolean {
  const role = roleOf(user)
  return role !== null && GRANTS[role].includes(permission)
}

/** Staff sessions end after this long without an admin request. */
export const STAFF_IDLE_MS = 8 * 60 * 60 * 1000
export const STAFF_SEEN_COOKIE = "sb-staff-seen"
