import "server-only"

import { notFound, redirect } from "next/navigation"

import { checkStaff } from "./admin"
import type { Permission } from "./roles"

/**
 * For admin pages: the staff user with `permission`, or a redirect. Students get a plain 404, staff without
 * two-factor go to verify it, and staff whose role doesn't cover the page go back to the admin home.
 */
export async function requireStaff(permission?: Permission) {
  const check = await checkStaff(permission)
  if (check.ok) return check
  if (check.reason === "signed_out") redirect("/sign-in?next=/admin")
  if (check.reason === "not_staff") notFound()
  if (check.reason === "mfa_required") redirect("/staff/verify")
  redirect("/admin?denied=1")
}
