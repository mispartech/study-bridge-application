import type { Metadata } from "next"
import { connection } from "next/server"
import { Suspense } from "react"

import Link from "next/link"

import { Card } from "@/components/ui/card"
import { formatUsd, totals, type UsageRow } from "@/lib/admin/users"
import { serviceClient } from "@/lib/db/service"
import { estimateCostUsd, getSettings } from "@/lib/settings"
import { requireStaff } from "@/lib/auth/staff-page"

export const metadata: Metadata = { title: "AI usage", robots: { index: false, follow: false } }

const DAYS = 30
const nf = new Intl.NumberFormat("en-GB")

/** First day of the reporting window (YYYY-MM-DD). Read per request, after connection(). */
function windowStart(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

async function UsageTables() {
  await connection() // per-request data; also keeps the service key out of the static build
  await requireStaff("ai")
  const since = windowStart(DAYS)
  const { data, error } = await serviceClient()
    .from("ai_usage_daily")
    .select("*")
    .gte("day", since)
    .order("day", { ascending: false })
    .order("task")
  if (error) return <p className="text-danger-strong">Could not load usage: {error.message}</p>
  const rows = data ?? []

  const totals = new Map<string, { calls: number; failures: number; input: number; output: number }>()
  for (const r of rows) {
    const t = totals.get(r.task ?? "") ?? { calls: 0, failures: 0, input: 0, output: 0 }
    t.calls += r.calls ?? 0
    t.failures += r.failures ?? 0
    t.input += Number(r.input_tokens ?? 0)
    t.output += Number(r.output_tokens ?? 0)
    totals.set(r.task ?? "", t)
  }

  return (
    <>
      <section className="grid gap-3 sm:grid-cols-3">
        {[...totals].map(([task, t]) => (
          <Card key={task} className="gap-1">
            <h2 className="text-sm font-semibold text-muted-foreground">{task}</h2>
            <p className="font-heading money text-2xl font-extrabold">{nf.format(t.calls)} calls</p>
            <p className="money text-sm text-muted-foreground">
              {nf.format(t.input)} in · {nf.format(t.output)} out · {nf.format(t.failures)} failed
            </p>
          </Card>
        ))}
        {totals.size === 0 && <p className="text-muted-foreground">No AI calls in the last {DAYS} days.</p>}
      </section>

      {rows.length > 0 && (
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Daily AI usage per task">
          <table className="w-full min-w-[40rem] money text-sm">
            <caption className="sr-only">Daily AI usage per task, last {DAYS} days (Lagos time)</caption>
            <thead className="text-left text-muted-foreground">
              <tr>
                {["Day", "Task", "Model", "Calls", "Failed", "Input tokens", "Output tokens", "Avg latency"].map(
                  (h) => (
                    <th key={h} scope="col" className="py-2 pr-4 font-medium">
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.day}-${r.task}-${r.provider}-${r.model}`} className="border-t border-border">
                  <td className="py-2 pr-4 whitespace-nowrap">{r.day}</td>
                  <td className="py-2 pr-4">{r.task}</td>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    {r.provider}:{r.model}
                  </td>
                  <td className="py-2 pr-4">{nf.format(r.calls ?? 0)}</td>
                  <td className="py-2 pr-4">{nf.format(r.failures ?? 0)}</td>
                  <td className="py-2 pr-4">{nf.format(Number(r.input_tokens ?? 0))}</td>
                  <td className="py-2 pr-4">{nf.format(Number(r.output_tokens ?? 0))}</td>
                  <td className="py-2 pr-4">{nf.format(r.avg_latency_ms ?? 0)} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

const RECENT = 50
const TOP_USERS = 20

/** Spend per account and the latest individual generations. Cost uses the prices set in Settings. */
async function PerUser() {
  await connection()
  await requireStaff("ai")
  const db = serviceClient()
  const since = new Date(Date.now() - DAYS * 86_400_000).toISOString()
  const [{ data: usage }, { data: recent }, { data: auth }, settings] = await Promise.all([
    db
      .from("ai_usage")
      .select("user_id, provider, model, input_tokens, output_tokens, success")
      .gte("created_at", since),
    db
      .from("ai_usage")
      .select("id, created_at, user_id, task, provider, model, input_tokens, output_tokens, success")
      .order("created_at", { ascending: false })
      .limit(RECENT),
    db.auth.admin.listUsers({ perPage: 1000 }),
    getSettings(),
  ])
  const emails = new Map((auth?.users ?? []).map((u) => [u.id, u.email ?? u.id]))
  const who = (id: string | null) => (id ? (emails.get(id) ?? id) : "system (ingestion, evals)")
  const groups = Map.groupBy((usage ?? []) as UsageRow[], (r) => r.user_id)
  const all = totals((usage ?? []) as UsageRow[], settings.model_prices)
  const perUser = [...groups]
    .map(([id, rows]) => ({ id, ...totals(rows, settings.model_prices) }))
    .sort((a, b) => b.input_tokens + b.output_tokens - (a.input_tokens + a.output_tokens))
    .slice(0, TOP_USERS)
  const th = (h: string) => (
    <th key={h} scope="col" className="py-2 pr-4 font-medium">
      {h}
    </th>
  )
  return (
    <>
      <Card className="gap-1">
        <h2 className="text-sm font-semibold text-muted-foreground">Estimated spend, last {DAYS} days</h2>
        <p className="font-heading text-2xl font-extrabold tabular-nums">{formatUsd(all.cost_usd)}</p>
        {all.cost_usd === null && (
          <p className="text-xs text-muted-foreground">
            Add model prices in <Link href="/admin/settings">Settings</Link> to see costs.
          </p>
        )}
      </Card>
      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-base font-bold">Spend by user</h2>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="AI spend by user">
          <table className="w-full min-w-[36rem] text-left text-sm tabular-nums">
            <thead className="text-muted-foreground">
              <tr>{["User", "Calls", "Failed", "Tokens", "Cost"].map(th)}</tr>
            </thead>
            <tbody>
              {perUser.map((u) => (
                <tr key={u.id ?? "system"} className="border-t border-border">
                  <td className="py-2 pr-4">
                    {u.id ? (
                      <Link href={`/admin/users/${u.id}`} className="underline underline-offset-4">
                        {who(u.id)}
                      </Link>
                    ) : (
                      who(null)
                    )}
                  </td>
                  <td className="py-2 pr-4">{nf.format(u.ai_calls)}</td>
                  <td className="py-2 pr-4">{nf.format(u.ai_failures)}</td>
                  <td className="py-2 pr-4">{nf.format(u.input_tokens + u.output_tokens)}</td>
                  <td className="py-2 pr-4">{formatUsd(u.cost_usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-base font-bold">Latest {RECENT} generations</h2>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Latest AI generations">
          <table className="w-full min-w-[44rem] text-left text-sm tabular-nums">
            <thead className="text-muted-foreground">
              <tr>{["When", "User", "Task", "Model", "Tokens", "Cost", "Result"].map(th)}</tr>
            </thead>
            <tbody>
              {(recent ?? []).map((c) => (
                <tr key={c.id} className="border-t border-border">
                  <td className="py-2 pr-4 whitespace-nowrap">{c.created_at.slice(0, 16).replace("T", " ")}</td>
                  <td className="py-2 pr-4 break-all">{who(c.user_id)}</td>
                  <td className="py-2 pr-4">{c.task}</td>
                  <td className="py-2 pr-4 font-mono text-xs">{c.model}</td>
                  <td className="py-2 pr-4">{nf.format((c.input_tokens ?? 0) + (c.output_tokens ?? 0))}</td>
                  <td className="py-2 pr-4">
                    {formatUsd(
                      estimateCostUsd(
                        settings.model_prices,
                        c.provider,
                        c.model,
                        c.input_tokens ?? 0,
                        c.output_tokens ?? 0
                      )
                    )}
                  </td>
                  <td className={c.success ? "py-2 pr-4" : "py-2 pr-4 text-danger-strong"}>
                    {c.success ? "ok" : "failed"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

export default function AiUsagePage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold">AI usage</h1>
        <p className="text-muted-foreground">Daily totals per task for the last {DAYS} days (Lagos time).</p>
      </header>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <PerUser />
      </Suspense>
      <h2 className="font-heading text-base font-bold">Daily totals per task</h2>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <UsageTables />
      </Suspense>
    </main>
  )
}
