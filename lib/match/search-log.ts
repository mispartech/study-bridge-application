import "server-only"

import { serviceClient } from "@/lib/db/service"

import type { MatchView } from "./present"
import type { MatchProfile } from "./types"

/** What one search records: no grades, names or free text. */
export function searchLogRow(profile: MatchProfile, view: MatchView, userId: string | null) {
  return {
    user_id: userId,
    fields: profile.field ? [profile.field] : [],
    countries: profile.preferred_countries,
    budget_ngn_minor: profile.budget_total_minor,
    ranked: view.ranked.length + view.more.length,
    near_misses: view.near_misses.length,
    data_confidence: view.data_confidence,
  }
}

/** Never throws: a failed log must not affect the student's results. */
export async function logSearch(row: ReturnType<typeof searchLogRow>) {
  try {
    const { error } = await serviceClient().from("search_log").insert(row)
    if (error) console.error("search_log insert failed:", error.message)
  } catch (err) {
    console.error("search_log failed:", err instanceof Error ? err.message : err)
  }
}
