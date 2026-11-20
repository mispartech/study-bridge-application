import "server-only"

import type { User } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

import { can, roleOf, type Permission, type StaffRole } from "./roles"
import { supabaseServer } from "./server"

export type StaffCheck =
  | { ok: true; user: User; role: StaffRole }
  | { ok: false; reason: "signed_out" | "not_staff" | "no_permission" | "mfa_required" }

/**
 * Who is asking, checked on the server: a verified user (getUser asks Supabase, so a removed role takes
 * effect at once), a staff role that allows `permission`, and a session verified with two-factor (aal2).
 */
export async function checkStaff(permission?: Permission): Promise<StaffCheck> {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, reason: "signed_out" }
  const role = roleOf(user)
  if (!role) return { ok: false, reason: "not_staff" }
  if (permission && !can(user, permission)) return { ok: false, reason: "no_permission" }
  // getClaims verifies the session token, so its assurance level can be trusted.
  const { data } = await supabase.auth.getClaims()
  if (data?.claims.aal !== "aal2") return { ok: false, reason: "mfa_required" }
  return { ok: true, user, role }
}

const DENIED: Record<Exclude<StaffCheck, { ok: true }>["reason"], [string, number]> = {
  signed_out: ["Sign in first", 401],
  // Students learn nothing about the admin console.
  not_staff: ["Not found", 404],
  no_permission: ["Your role can't do that", 403],
  mfa_required: ["Verify with your authenticator app first", 403],
}

/** For admin API routes: the staff user, or a response to return. */
export async function staffFromRequest(permission: Permission) {
  const check = await checkStaff(permission)
  if (check.ok) return { user: check.user, role: check.role, denied: null }
  const [error, status] = DENIED[check.reason]
  return { user: null, role: null, denied: NextResponse.json({ error, code: check.reason }, { status }) }
}
