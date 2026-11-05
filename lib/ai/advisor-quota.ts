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
/** Today's count without using a message, for showing the student what's left. */
export async function advisorQuotaStatus(userId: string): Promise<Pick<AdvisorQuota, "used" | "limit">> {
  const db = serviceClient()
  const day = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" })
  const [{ data: usage }, { data: subscription }] = await Promise.all([
    db.from("advisor_daily_usage").select("messages").eq("user_id", userId).eq("day", day).maybeSingle(),
    db.from("subscription").select("plan, current_period_end").eq("user_id", userId).maybeSingle(),
  ])
  const end = subscription?.current_period_end
  const plus = subscription?.plan === "plus" && (!end || new Date(end) > new Date())
  return { used: usage?.messages ?? 0, limit: plus ? null : FREE_ADVISOR_MESSAGES_PER_DAY }
}

export async function consumeAdvisorMessage(userId: string): Promise<AdvisorQuota> {
  const { data, error } = await serviceClient()
    .rpc("consume_advisor_message", { p_user_id: userId, p_free_limit: FREE_ADVISOR_MESSAGES_PER_DAY })
    .single()
  if (error || !data) throw new Error(`Advisor quota check failed: ${error?.message ?? "no result"}`)
  return { allowed: data.allowed, used: data.used, limit: data.daily_limit, plan: data.plan }
}
