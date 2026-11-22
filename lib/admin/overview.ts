import "server-only"

import { serviceClient } from "@/lib/db/service"
import { getSettings } from "@/lib/settings"

import { count, funnel, type Summary } from "./funnel"
import { internalUserIds, withoutInternal } from "./internal"
import { presetRange, type Range } from "./range"
import { totals, type UsageRow } from "./users"

export type Kpi = { label: string; today: string; week: string; month: string }

const nf = new Intl.NumberFormat("en-GB")

async function summary(from: Date, to: Date, internal: boolean): Promise<Summary> {
  const { data, error } = await serviceClient().rpc("activity_summary", {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_include_internal: internal,
  })
  if (error) throw error
  return (data ?? []).map((r) => ({ event: r.event, events: Number(r.events), actors: Number(r.actors) }))
}

/** Headline numbers for one window, from the database's own counts. */
async function windowNumbers(range: Range, internal: boolean, internalIds: Set<string>) {
  const db = serviceClient()
  const from = range.from.toISOString()
  const to = range.to.toISOString()
  const [s, claimRows, paymentRows, usageRows, errors, settings] = await Promise.all([
    summary(range.from, range.to, internal),
    db.from("report").select("claimed_user_id").gte("claimed_at", from).lt("claimed_at", to),
    db
      .from("payment")
      .select("user_id, amount_minor, currency")
      .eq("status", "paid")
      .gte("paid_at", from)
      .lt("paid_at", to),
    db
      .from("ai_usage")
      .select("user_id, provider, model, input_tokens, output_tokens, success")
      .gte("created_at", from)
      .lt("created_at", to),
    db.from("error_report").select("id", { count: "exact", head: true }).gte("created_at", from).lt("created_at", to),
    getSettings(),
  ])
  // Internal accounts' rows go unless the admin asked to include them.
  const keep = <T>(rows: T[] | null, userOf: (row: T) => string | null) =>
    internal ? (rows ?? []) : withoutInternal(rows ?? [], internalIds, userOf)
  const claims = keep(claimRows.data, (r) => r.claimed_user_id).length
  const payments = keep(paymentRows.data, (r) => r.user_id)
  const usage = keep(usageRows.data, (r) => r.user_id)
  const revenue = new Map<string, number>()
  for (const p of payments) revenue.set(p.currency, (revenue.get(p.currency) ?? 0) + p.amount_minor)
  const ai = totals(usage as UsageRow[], settings.model_prices)
  return {
    accounts: count(s, "account_created"),
    reports: count(s, "report_emailed"),
    claims,
    applies: count(s, "apply_clicked"),
    revenue:
      [...revenue].map(([currency, minor]) => `${currency} ${nf.format(Math.round(minor / 100))}`).join(", ") || "0",
    advisor: count(s, "advisor_message"),
    aiCost: ai.ai_calls === 0 ? "$0.00" : ai.cost_usd === null ? "price not set" : `$${ai.cost_usd.toFixed(2)}`,
    guard: count(s, "advisor_guard_triggered"),
    errors: errors.count ?? 0,
  }
}

const KPI_ROWS: [keyof Awaited<ReturnType<typeof windowNumbers>>, string][] = [
  ["accounts", "New accounts"],
  ["reports", "Emailed reports"],
  ["claims", "Reports opened as accounts"],
  ["applies", "Apply clicks"],
  ["revenue", "Plus revenue"],
  ["advisor", "Advisor messages"],
  ["aiCost", "AI cost"],
  ["guard", "Advisor guard triggers"],
  ["errors", "Error reports"],
]

export type TargetCount = { id: string; title: string; total: number; reasons: Record<string, number> }

/** Everything the Overview page shows, for the selected range plus fixed today / 7 / 30 day columns. */
export async function loadOverview(range: Range, now: Date, internal = false) {
  const db = serviceClient()
  const args = { p_from: range.from.toISOString(), p_to: range.to.toISOString(), p_include_internal: internal }
  const internalIds = internal ? new Set<string>() : await internalUserIds()
  const [selected, today, week, month, byTarget, searches, review] = await Promise.all([
    summary(range.from, range.to, internal),
    windowNumbers(presetRange("today", now), internal, internalIds),
    windowNumbers(presetRange("7d", now), internal, internalIds),
    windowNumbers(presetRange("30d", now), internal, internalIds),
    db.rpc("activity_by_target", { ...args, p_events: ["programme_saved", "programme_dismissed", "apply_clicked"] }),
    db.rpc("search_summary", args),
    db.from("review_queue").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ])

  const kpis: Kpi[] = KPI_ROWS.map(([key, label]) => ({
    label,
    today: typeof today[key] === "number" ? nf.format(today[key] as number) : String(today[key]),
    week: typeof week[key] === "number" ? nf.format(week[key] as number) : String(week[key]),
    month: typeof month[key] === "number" ? nf.format(month[key] as number) : String(month[key]),
  }))

  const rows = byTarget.data ?? []
  const ids = [...new Set(rows.map((r) => r.target_id))]
  const { data: programmes } = ids.length
    ? await db.from("programme").select("id, title").in("id", ids)
    : { data: [] as { id: string; title: string }[] }
  const titles = new Map((programmes ?? []).map((p) => [p.id, p.title]))
  const top = (event: string): TargetCount[] => {
    const map = new Map<string, TargetCount>()
    for (const r of rows.filter((r) => r.event === event)) {
      const t = map.get(r.target_id) ?? {
        id: r.target_id,
        title: titles.get(r.target_id) ?? "Removed programme",
        total: 0,
        reasons: {},
      }
      t.total += Number(r.events)
      if (r.reason) t.reasons[r.reason] = (t.reasons[r.reason] ?? 0) + Number(r.events)
      map.set(r.target_id, t)
    }
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 10)
  }
  const searchRows = (searches.data ?? []).map((r) => ({ kind: r.kind, key: r.key, n: Number(r.n) }))
  const group = (kind: string) => searchRows.filter((r) => r.kind === kind).sort((a, b) => b.n - a.n)

  return {
    funnel: funnel(selected),
    kpis,
    openReview: review.count ?? 0,
    topSaved: top("programme_saved"),
    topDismissed: top("programme_dismissed"),
    topApplied: top("apply_clicked"),
    fields: group("field"),
    countries: group("country"),
    budgets: group("budget"),
  }
}
