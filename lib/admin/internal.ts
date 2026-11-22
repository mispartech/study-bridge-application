import "server-only"

import { can, type WithMetadata } from "@/lib/auth/roles"
import { serviceClient } from "@/lib/db/service"
import { deviceIdFrom } from "@/lib/security/limits"
import { hashKey } from "@/lib/security/rate-limit"

/**
 * Staff and test accounts (and staff devices) are left out of metrics by default. Admins can put them back
 * with ?internal=1, for checking that tracking works.
 */
export function includeInternal(params: { internal?: string }, user: WithMetadata): boolean {
  return params.internal === "1" && can(user, "roles")
}

/** User ids of internal accounts, to drop their rows from tables the summaries don't cover. */
export async function internalUserIds(): Promise<Set<string>> {
  const { data, error } = await serviceClient().from("internal_actor").select("actor_id").eq("kind", "user")
  if (error) throw error
  return new Set((data ?? []).map((r) => r.actor_id))
}

/** Keeps rows whose user isn't internal. Rows with no user (visitors, system jobs) always stay. */
export function withoutInternal<T>(rows: T[], ids: Set<string>, userOf: (row: T) => string | null): T[] {
  return rows.filter((row) => {
    const id = userOf(row)
    return id === null || !ids.has(id)
  })
}

/**
 * A staff member's browser is internal too: anything they do there while signed out (testing the student
 * journey) is logged under this device's key, so it's left out of the numbers like their account is.
 */
export async function markStaffDevice(cookieHeader: string): Promise<void> {
  const deviceId = deviceIdFrom(cookieHeader)
  if (!deviceId) return
  const { error } = await serviceClient()
    .from("internal_actor")
    .upsert({ actor_id: hashKey(`device:${deviceId}`), kind: "device", reason: "staff" }, { ignoreDuplicates: true })
  if (error) console.error("Could not mark the staff device internal:", error.message)
}
