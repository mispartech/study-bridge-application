import { connection } from "next/server"

import { DataTable, type Column } from "@/components/admin/data-table"
import { FilterBar } from "@/components/admin/filter-bar"
import { KpiGrid, KpiTile } from "@/components/admin/kpi-tile"
import { PageHeader } from "@/components/admin/page-header"
import { RangeFilter } from "@/components/admin/range-filter"
import { includeInternal } from "@/lib/admin/internal"
import { parseRange } from "@/lib/admin/range"
import type { SearchParams } from "@/lib/admin/table"
import { formatUsd } from "@/lib/admin/users"
import { requireStaff } from "@/lib/auth/staff-page"
import { serviceClient } from "@/lib/db/service"
import { estimateCostUsd, getSettings } from "@/lib/settings"

const nf = new Intl.NumberFormat("en-GB")
const lagosDay = (d: Date) => new Date(d.getTime() + 3_600_000).toISOString().slice(0, 10)
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

type Day = { day: string; messages: number; guards: number; cost: number | null; calls: number; failures: number }

const DAYS: Column<Day>[] = [
  { key: "day", header: "Day", nowrap: true, sort: (r) => r.day, cell: (r) => r.day },
  { key: "messages", header: "Messages", align: "right", sort: (r) => r.messages, cell: (r) => nf.format(r.messages) },
  { key: "calls", header: "Model calls", align: "right", sort: (r) => r.calls, cell: (r) => nf.format(r.calls) },
  {
    key: "failures",
    header: "Failed calls",
    align: "right",
    sort: (r) => r.failures,
    cell: (r) => nf.format(r.failures),
  },
  { key: "guards", header: "Guard triggers", align: "right", sort: (r) => r.guards, cell: (r) => nf.format(r.guards) },
  {
    key: "cost",
    header: "Cost",
    align: "right",
    sort: (r) => r.cost,
    cell: (r) => (r.calls ? formatUsd(r.cost) : "—"),
  },
]

/** Advisor health: messages, cost by model, guard triggers and thumbs, per day. Never the message text. */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection()
  const { user } = await requireStaff("ai")
  const params = await searchParams
  const range = parseRange({ range: one(params.range), from: one(params.from), to: one(params.to) }, new Date())
  const internal = includeInternal({ internal: one(params.internal) }, user)
  const db = serviceClient()
  const from = range.from.toISOString()
  const to = range.to.toISOString()
  const [daily, usage, guards, thumbs, settings] = await Promise.all([
    db.rpc("activity_daily", {
      p_from: from,
      p_to: to,
      p_events: ["advisor_message", "advisor_guard_triggered"],
      p_include_internal: internal,
    }),
    db
      .rpc("ai_usage_daily_summary", { p_since: lagosDay(range.from), p_include_internal: internal })
      .eq("task", "advisor")
      .lt("day", lagosDay(range.to)) // range.to is the next midnight, so the end is exclusive
      .order("day"),
    db.from("advisor_guard_log").select("outcome").gte("created_at", from).lt("created_at", to),
    db
      .from("activity_event")
      .select("properties")
      .eq("event", "advisor_thumbs")
      .gte("occurred_at", from)
      .lt("occurred_at", to),
    getSettings(),
  ])

  const days = new Map<
    string,
    { messages: number; guards: number; cost: number | null; calls: number; failures: number }
  >()
  const day = (d: string) => {
    const row = days.get(d) ?? { messages: 0, guards: 0, cost: 0, calls: 0, failures: 0 }
    days.set(d, row)
    return row
  }
  for (const r of daily.data ?? []) {
    const row = day(String(r.day))
    if (r.event === "advisor_message") row.messages += Number(r.events)
    else row.guards += Number(r.events)
  }
  const byModel = new Map<string, { calls: number; cost: number | null }>()
  for (const r of usage.data ?? []) {
    const row = day(String(r.day))
    const cost = estimateCostUsd(
      settings.model_prices,
      r.provider ?? "",
      r.model ?? "",
      Number(r.input_tokens ?? 0),
      Number(r.output_tokens ?? 0)
    )
    row.calls += r.calls ?? 0
    row.failures += r.failures ?? 0
    row.cost = row.cost === null || cost === null ? null : row.cost + cost
    const key = `${r.provider}:${r.model}`
    const m = byModel.get(key) ?? { calls: 0, cost: 0 }
    m.calls += r.calls ?? 0
    m.cost = m.cost === null || cost === null ? null : m.cost + cost
    byModel.set(key, m)
  }
  const outcomes = new Map<string, number>()
  for (const g of guards.data ?? []) outcomes.set(g.outcome, (outcomes.get(g.outcome) ?? 0) + 1)
  const votes = (thumbs.data ?? []).map((t) => (t.properties as { up?: boolean }).up)
  const up = votes.filter(Boolean).length

  return (
    <>
      <PageHeader
        title="Advisor monitor"
        description="Messages, cost by model, guard triggers and thumbs, per day. Never the message text."
      />
      <FilterBar>
        <RangeFilter path="/admin/advisor" range={range} />
      </FilterBar>
      <KpiGrid columns={3}>
        <KpiTile
          label="Guard triggers"
          value={nf.format(guards.data?.length ?? 0)}
          detail={[...outcomes].map(([k, v]) => `${k.replace("_", " ")} ${v}`).join(" · ") || "None"}
        />
        <KpiTile label="Answers rated" value={`${nf.format(up)} 👍 · ${nf.format(votes.length - up)} 👎`} />
        <KpiTile
          label="Cost by model"
          value={formatUsd(
            [...byModel.values()].reduce<number | null>(
              (n, m) => (n === null || m.cost === null ? null : n + m.cost),
              0
            )
          )}
          detail={
            byModel.size === 0 ? (
              "No advisor calls."
            ) : (
              <ul>
                {[...byModel].map(([model, m]) => (
                  <li key={model} className="flex justify-between gap-2">
                    <span className="truncate font-mono">{model}</span>
                    <span>
                      {nf.format(m.calls)} calls · {formatUsd(m.cost)}
                    </span>
                  </li>
                ))}
              </ul>
            )
          }
        />
      </KpiGrid>
      <DataTable
        label="Advisor per day"
        columns={DAYS}
        rows={[...days].map(([day, r]) => ({ day, ...r }))}
        rowKey={(r) => r.day}
        rowProps={() => ({ "data-testid": "advisor-day" })}
        path="/admin/advisor"
        params={params}
        defaultSort="day"
        minWidth="36rem"
        empty="No advisor activity in this range."
      />
      <p className="text-xs text-muted-foreground">
        Evaluation runs live in GitHub Actions (Advisor eval). Conversations aren&apos;t stored, so there&apos;s nothing
        to open here.
      </p>
    </>
  )
}
