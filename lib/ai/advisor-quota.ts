import "server-only"

import { serviceClient } from "@/lib/db/service"

/** Advisor messages per Lagos day on the free plan. Plus is unlimited. */
export const FREE_ADVISOR_MESSAGES_PER_DAY = 5

export type AdvisorQuota = {
  allowed: boolean
  used: number
  /** null for unlimited (Plus). */
  limit: number | null
  plan: "free" | "plus"
}

/**
 * Records one advisor message for `userId` if their plan allows it. Enforced in the
 * database (atomic upsert), so parallel requests can't exceed the limit. Call it before
 * invoking the model, with the user id from the server-side session, never from the client.
 */
export async function consumeAdvisorMessage(userId: string): Promise<AdvisorQuota> {
  const { data, error } = await serviceClient()
    .rpc("consume_advisor_message", { p_user_id: userId, p_free_limit: FREE_ADVISOR_MESSAGES_PER_DAY })
    .single()
  if (error || !data) throw new Error(`Advisor quota check failed: ${error?.message ?? "no result"}`)
  return { allowed: data.allowed, used: data.used, limit: data.daily_limit, plan: data.plan }
}
