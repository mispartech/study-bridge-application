import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/db/database.types"

import { FREE_SHORTLIST_LIMIT } from "./shortlist"

/** Runs as the student, so RLS decides whose shortlist this touches. */
export async function addToShortlist(
  supabase: SupabaseClient<Database>,
  programmeId: string
): Promise<"added" | "limit" | "no_profile" | "error"> {
  const { data: profile } = await supabase.from("student_profile").select("id").maybeSingle()
  if (!profile) return "no_profile"
  const { count } = await supabase.from("shortlist").select("id", { count: "exact", head: true })
  if ((count ?? 0) >= FREE_SHORTLIST_LIMIT) return "limit"
  const { error } = await supabase
    .from("shortlist")
    .upsert(
      { student_id: profile.id, programme_id: programmeId },
      { onConflict: "student_id,programme_id", ignoreDuplicates: true }
    )
  return error ? "error" : "added"
}
