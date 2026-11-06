import type { Metadata } from "next"
import { connection } from "next/server"
import { Suspense } from "react"

import { Card } from "@/components/ui/card"
import { serviceClient } from "@/lib/db/service"

export const metadata: Metadata = { title: "AI usage", robots: { index: false, follow: false } }

const DAYS = 30
const nf = new Intl.NumberFormat("en-GB")

/** First day of the reporting window (YYYY-MM-DD). Read per request, after connection(). */
function windowStart(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

async function UsageTables() {
  await connection() // per-request data; also keeps the service key out of the static build
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

export default function AiUsagePage() {
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold">AI usage</h1>
        <p className="text-muted-foreground">Daily totals per task for the last {DAYS} days (Lagos time).</p>
      </header>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <UsageTables />
      </Suspense>
    </main>
  )
}
