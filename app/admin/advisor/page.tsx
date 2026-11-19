import { connection } from "next/server"

import { RangeFilter } from "@/components/admin/range-filter"
import { Card } from "@/components/ui/card"
import { parseRange } from "@/lib/admin/range"
import { formatUsd } from "@/lib/admin/users"
import { requireStaff } from "@/lib/auth/staff-page"
import { serviceClient } from "@/lib/db/service"
import { estimateCostUsd, getSettings } from "@/lib/settings"

const nf = new Intl.NumberFormat("en-GB")
const lagosDay = (d: Date) => new Date(d.getTime() + 3_600_000).toISOString().slice(0, 10)

/** Advisor health: messages, cost by model, guard triggers and thumbs, per day. Never the message text. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>
}) {
  await connection()
  await requireStaff("ai")
  const range = parseRange(await searchParams, new Date())
  const db = serviceClient()
  const from = range.from.toISOString()
  const to = range.to.toISOString()
  const [daily, usage, guards, thumbs, settings] = await Promise.all([
    db.rpc("activity_daily", { p_from: from, p_to: to, p_events: ["advisor_message", "advisor_guard_triggered"] }),
    db
      .from("ai_usage_daily")
      .select("day, provider, model, calls, failures, input_tokens, output_tokens")
      .eq("task", "advisor")
      .gte("day", lagosDay(range.from))
      .lte("day", lagosDay(range.to))
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
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-xl font-bold">Advisor monitor</h1>
      <RangeFilter path="/admin/advisor" range={range} />
      <section className="grid gap-3 sm:grid-cols-3">
        <Card className="gap-1">
          <h2 className="text-sm text-muted-foreground">Guard triggers</h2>
          <p className="font-heading text-2xl font-extrabold tabular-nums">{nf.format(guards.data?.length ?? 0)}</p>
          <p className="text-xs text-muted-foreground">
            {[...outcomes].map(([k, v]) => `${k.replace("_", " ")} ${v}`).join(" · ") || "None"}
          </p>
        </Card>
        <Card className="gap-1">
          <h2 className="text-sm text-muted-foreground">Answers rated</h2>
          <p className="font-heading text-2xl font-extrabold tabular-nums">
            {nf.format(up)} 👍 · {nf.format(votes.length - up)} 👎
          </p>
        </Card>
        <Card className="gap-1">
          <h2 className="text-sm text-muted-foreground">Cost by model</h2>
          {byModel.size === 0 ? (
            <p className="text-sm text-muted-foreground">No advisor calls.</p>
          ) : (
            <ul className="text-sm tabular-nums">
              {[...byModel].map(([model, m]) => (
                <li key={model} className="flex justify-between gap-2">
                  <span className="truncate font-mono text-xs">{model}</span>
                  <span>
                    {nf.format(m.calls)} calls · {formatUsd(m.cost)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Advisor per day">
        <table className="w-full min-w-[36rem] text-left text-sm tabular-nums">
          <thead className="text-muted-foreground">
            <tr>
              {["Day", "Messages", "Model calls", "Failed calls", "Guard triggers", "Cost"].map((h) => (
                <th key={h} scope="col" className="py-2 pr-4 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...days]
              .sort((a, b) => b[0].localeCompare(a[0]))
              .map(([d, r]) => (
                <tr key={d} data-testid="advisor-day" className="border-t border-border">
                  <td className="py-2 pr-4">{d}</td>
                  <td className="py-2 pr-4">{nf.format(r.messages)}</td>
                  <td className="py-2 pr-4">{nf.format(r.calls)}</td>
                  <td className="py-2 pr-4">{nf.format(r.failures)}</td>
                  <td className="py-2 pr-4">{nf.format(r.guards)}</td>
                  <td className="py-2 pr-4">{r.calls ? formatUsd(r.cost) : "—"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Evaluation runs live in GitHub Actions (Advisor eval). Conversations aren&apos;t stored, so there&apos;s nothing
        to open here.
      </p>
    </div>
  )
}
