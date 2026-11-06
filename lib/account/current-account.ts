import "server-only"

import { supabaseServer } from "@/lib/auth/server"

import { rowToProfile } from "./profile-row"

/** The signed-in student's saved profile and shortlist. Goes through RLS, so an expired session finds nothing. */
export async function loadAccount() {
  const supabase = await supabaseServer()
  const [{ data: row }, { data: shortlist }] = await Promise.all([
    supabase.from("student_profile").select("*").maybeSingle(),
    supabase.from("shortlist").select("programme_id"),
  ])
  if (!row?.consent_given_at) return null
  return {
    profile: row.field === null && row.cgpa === null ? null : rowToProfile(row, new Date()),
    completeness: row.completeness,
    saved: (shortlist ?? []).map((s) => s.programme_id),
  }
}
