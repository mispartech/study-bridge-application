import { roleOf } from "@/lib/auth/roles"
import { estimateCostUsd, type Settings } from "@/lib/settings/schema"

export type UsageRow = {
  user_id?: string | null
  provider: string
  model: string
  input_tokens: number | null
  output_tokens: number | null
  success: boolean
}

export type UserSummary = {
  id: string
  email: string | null
  created_at: string
  last_sign_in_at: string | null
  admin: boolean
  role: "student" | "support" | "data_editor" | "admin"
  suspended: boolean
  internal: boolean
  plan: "free" | "plus"
  searches: number
  ai_calls: number
  ai_failures: number
  input_tokens: number
  output_tokens: number
  /** US dollars; null when no price is set for a model this user used. */
  cost_usd: number | null
}

type AuthUser = {
  id: string
  email?: string | null
  created_at: string
  last_sign_in_at?: string | null
  app_metadata?: Record<string, unknown>
  banned_until?: string | null
}

export type UsageTotals = Pick<UserSummary, "ai_calls" | "ai_failures" | "input_tokens" | "output_tokens" | "cost_usd">

/** Calls, tokens and estimated cost for a set of usage rows. */
export function totals(rows: UsageRow[], prices: Settings["model_prices"]): UsageTotals {
  const t: UsageTotals = { ai_calls: 0, ai_failures: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0 }
  for (const r of rows) {
    t.ai_calls += 1
    if (!r.success) t.ai_failures += 1
    const input = r.input_tokens ?? 0
    const output = r.output_tokens ?? 0
    t.input_tokens += input
    t.output_tokens += output
    const cost = estimateCostUsd(prices, r.provider, r.model, input, output)
    t.cost_usd = cost === null || t.cost_usd === null ? null : t.cost_usd + cost
  }
  return t
}

/** One row per account for the Users page, most recently active first. */
export function summariseUsers(
  users: AuthUser[],
  usage: UsageRow[],
  searches: { user_id: string | null }[],
  plans: { user_id: string; plan: "free" | "plus"; current_period_end: string | null }[],
  prices: Settings["model_prices"],
  now: Date
): UserSummary[] {
  const usageBy = Map.groupBy(usage, (r) => r.user_id ?? "")
  const searchCount = new Map<string, number>()
  for (const s of searches) if (s.user_id) searchCount.set(s.user_id, (searchCount.get(s.user_id) ?? 0) + 1)
  const planBy = new Map(plans.map((p) => [p.user_id, p]))
  return users
    .map((u) => {
      const p = planBy.get(u.id)
      const active = p?.plan === "plus" && (!p.current_period_end || new Date(p.current_period_end) > now)
      return {
        id: u.id,
        email: u.email ?? null,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        admin: u.app_metadata?.role === "admin",
        role: (roleOf(u) ?? "student") as UserSummary["role"],
        suspended: Boolean(u.banned_until && new Date(u.banned_until) > now),
        // Staff and test accounts, flagged by the database: left out of metrics by default.
        internal: u.app_metadata?.is_internal === true,
        plan: active ? ("plus" as const) : ("free" as const),
        searches: searchCount.get(u.id) ?? 0,
        ...totals(usageBy.get(u.id) ?? [], prices),
      }
    })
    .sort((a, b) => (b.last_sign_in_at ?? b.created_at).localeCompare(a.last_sign_in_at ?? a.created_at))
}

export const formatUsd = (n: number | null) =>
  n === null ? "price not set" : n < 0.01 && n > 0 ? "< $0.01" : `$${n.toFixed(2)}`

export type UserFilter = { q?: string; role?: string; plan?: string; status?: string }

/** Search by email or id, and filter by role, plan and status. */
export function filterUsers(rows: UserSummary[], f: UserFilter): UserSummary[] {
  const q = f.q?.trim().toLowerCase()
  return rows.filter(
    (r) =>
      (!q || (r.email ?? "").toLowerCase().includes(q) || r.id.startsWith(q)) &&
      (!f.role || r.role === f.role) &&
      (!f.plan || r.plan === f.plan) &&
      (!f.status || (f.status === "suspended" ? r.suspended : !r.suspended))
  )
}
