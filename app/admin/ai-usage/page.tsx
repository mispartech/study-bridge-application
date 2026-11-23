import type { Metadata } from "next"
import { connection } from "next/server"
import { Suspense } from "react"

import Link from "next/link"

import { DataTable, type Column } from "@/components/admin/data-table"
import { InternalToggle } from "@/components/admin/internal-toggle"
import { KpiGrid, KpiTile } from "@/components/admin/kpi-tile"
import { PageHeader } from "@/components/admin/page-header"
import { ErrorState, LoadingSkeleton } from "@/components/admin/states"
import { StatusBadge } from "@/components/admin/status-badge"
import { Card } from "@/components/ui/card"
import { includeInternal, internalUserIds, withoutInternal } from "@/lib/admin/internal"
import type { SearchParams } from "@/lib/admin/table"
import { can } from "@/lib/auth/roles"
import { formatUsd, totals, type UsageRow } from "@/lib/admin/users"
import { serviceClient } from "@/lib/db/service"
import { estimateCostUsd, getSettings } from "@/lib/settings"
import { requireStaff } from "@/lib/auth/staff-page"

export const metadata: Metadata = { title: "AI usage", robots: { index: false, follow: false } }

const DAYS = 30
const nf = new Intl.NumberFormat("en-GB")
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

/** ISO time `days` ago. Read per request, after connection(). */
const daysAgoIso = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()

/** First day of the reporting window (YYYY-MM-DD). Read per request, after connection(). */
function windowStart(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

type Daily = {
  day: string
  task: string
  provider: string
  model: string
  calls: number
  failures: number
  input_tokens: number
  output_tokens: number
  avg_latency_ms: number
}

const DAILY: Column<Daily>[] = [
  { key: "day", header: "Day", nowrap: true, sort: (r) => r.day, cell: (r) => r.day },
  { key: "task", header: "Task", sort: (r) => r.task, cell: (r) => r.task },
  {
    key: "model",
    header: "Model",
    sort: (r) => `${r.provider}:${r.model}`,
    cell: (r) => <span className="font-mono text-xs">{`${r.provider}:${r.model}`}</span>,
  },
  { key: "calls", header: "Calls", align: "right", sort: (r) => r.calls, cell: (r) => nf.format(r.calls ?? 0) },
  { key: "failed", header: "Failed", align: "right", sort: (r) => r.failures, cell: (r) => nf.format(r.failures ?? 0) },
  {
    key: "in",
    header: "Input tokens",
    align: "right",
    sort: (r) => Number(r.input_tokens ?? 0),
    cell: (r) => nf.format(Number(r.input_tokens ?? 0)),
  },
  {
    key: "out",
    header: "Output tokens",
    align: "right",
    sort: (r) => Number(r.output_tokens ?? 0),
    cell: (r) => nf.format(Number(r.output_tokens ?? 0)),
  },
  {
    key: "latency",
    header: "Avg latency",
    align: "right",
    sort: (r) => r.avg_latency_ms,
    cell: (r) => `${nf.format(r.avg_latency_ms ?? 0)} ms`,
  },
]

async function UsageTables({ params }: { params: Params }) {
  await connection() // per-request data; also keeps the service key out of the static build
  const { user } = await requireStaff("ai")
  const p = await params
  const since = windowStart(DAYS)
  const { data, error } = await serviceClient()
    .rpc("ai_usage_daily_summary", {
      p_since: since,
      p_include_internal: includeInternal({ internal: one(p.internal) }, user),
    })
    .order("day", { ascending: false })
    .order("task")
  if (error) return <ErrorState title="Could not load usage" message={error.message} />
  const rows = data ?? []

  const byTask = new Map<string, { calls: number; failures: number; input: number; output: number }>()
  for (const r of rows) {
    const t = byTask.get(r.task ?? "") ?? { calls: 0, failures: 0, input: 0, output: 0 }
    t.calls += r.calls ?? 0
    t.failures += r.failures ?? 0
    t.input += Number(r.input_tokens ?? 0)
    t.output += Number(r.output_tokens ?? 0)
    byTask.set(r.task ?? "", t)
  }

  return (
    <>
      <KpiGrid columns={3}>
        {[...byTask].map(([task, t]) => (
          <KpiTile
            key={task}
            label={task}
            value={`${nf.format(t.calls)} calls`}
            detail={`${nf.format(t.input)} in · ${nf.format(t.output)} out · ${nf.format(t.failures)} failed`}
          />
        ))}
      </KpiGrid>
      <DataTable
        label="Daily AI usage per task"
        caption={`Daily AI usage per task, last ${DAYS} days (Lagos time)`}
        columns={DAILY}
        rows={rows}
        rowKey={(r) => `${r.day}-${r.task}-${r.provider}-${r.model}`}
        path="/admin/ai-usage"
        params={p}
        prefix="d."
        minWidth="40rem"
        empty={`No AI calls in the last ${DAYS} days.`}
      />
    </>
  )
}

const RECENT = 50
const TOP_USERS = 20

type Spender = {
  id: string | null
  ai_calls: number
  ai_failures: number
  input_tokens: number
  output_tokens: number
  cost_usd: number | null
}
type Generation = {
  id: string
  created_at: string
  user_id: string | null
  task: string
  provider: string
  model: string
  input_tokens: number | null
  output_tokens: number | null
  success: boolean
}

/** Spend per account and the latest individual generations. Cost uses the prices set in Settings. */
async function PerUser({ params }: { params: Params }) {
  await connection()
  const { user } = await requireStaff("ai")
  const p = await params
  const internal = includeInternal({ internal: one(p.internal) }, user)
  const internalIds = internal ? new Set<string>() : await internalUserIds()
  const db = serviceClient()
  const since = daysAgoIso(DAYS)
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
  // Staff and test accounts' spend is left out of the totals unless an admin includes it.
  const counted = withoutInternal((usage ?? []) as UsageRow[], internalIds, (r) => r.user_id ?? null)
  const groups = Map.groupBy(counted, (r) => r.user_id)
  const all = totals(counted, settings.model_prices)
  const perUser: Spender[] = [...groups]
    .map(([id, rows]) => ({ id: id ?? null, ...totals(rows, settings.model_prices) }))
    .sort((a, b) => b.input_tokens + b.output_tokens - (a.input_tokens + a.output_tokens))
    .slice(0, TOP_USERS)
  const cost = (c: Generation) =>
    estimateCostUsd(settings.model_prices, c.provider, c.model, c.input_tokens ?? 0, c.output_tokens ?? 0)

  const spenders: Column<Spender>[] = [
    {
      key: "user",
      header: "User",
      sort: (u) => who(u.id),
      cell: (u) =>
        u.id ? (
          <Link href={`/admin/users/${u.id}`} className="break-all underline underline-offset-4">
            {who(u.id)}
          </Link>
        ) : (
          who(null)
        ),
    },
    { key: "calls", header: "Calls", align: "right", sort: (u) => u.ai_calls, cell: (u) => nf.format(u.ai_calls) },
    {
      key: "failed",
      header: "Failed",
      align: "right",
      sort: (u) => u.ai_failures,
      cell: (u) => nf.format(u.ai_failures),
    },
    {
      key: "tokens",
      header: "Tokens",
      align: "right",
      sort: (u) => u.input_tokens + u.output_tokens,
      cell: (u) => nf.format(u.input_tokens + u.output_tokens),
    },
    { key: "cost", header: "Cost", align: "right", sort: (u) => u.cost_usd, cell: (u) => formatUsd(u.cost_usd) },
  ]
  const generations: Column<Generation>[] = [
    {
      key: "when",
      header: "When",
      nowrap: true,
      sort: (c) => c.created_at,
      cell: (c) => c.created_at.slice(0, 16).replace("T", " "),
    },
    { key: "user", header: "User", cell: (c) => <span className="break-all">{who(c.user_id)}</span> },
    { key: "task", header: "Task", sort: (c) => c.task, cell: (c) => c.task },
    { key: "model", header: "Model", cell: (c) => <span className="font-mono text-xs">{c.model}</span> },
    {
      key: "tokens",
      header: "Tokens",
      align: "right",
      sort: (c) => (c.input_tokens ?? 0) + (c.output_tokens ?? 0),
      cell: (c) => nf.format((c.input_tokens ?? 0) + (c.output_tokens ?? 0)),
    },
    { key: "cost", header: "Cost", align: "right", sort: cost, cell: (c) => formatUsd(cost(c)) },
    {
      key: "result",
      header: "Result",
      cell: (c) => <StatusBadge tone={c.success ? "success" : "danger"}>{c.success ? "ok" : "failed"}</StatusBadge>,
    },
  ]

  return (
    <>
      <KpiGrid columns={3}>
        <KpiTile
          label={`Estimated spend, last ${DAYS} days`}
          value={formatUsd(all.cost_usd)}
          detail={
            all.cost_usd === null ? (
              <>
                Add model prices in <Link href="/admin/settings">Settings</Link> to see costs.
              </>
            ) : undefined
          }
        />
      </KpiGrid>
      <Card className="gap-2">
        <h2 className="font-heading text-base font-bold">Spend by user</h2>
        <DataTable
          label="AI spend by user"
          columns={spenders}
          rows={perUser}
          rowKey={(u) => u.id ?? "system"}
          path="/admin/ai-usage"
          params={p}
          prefix="u."
          minWidth="36rem"
          empty="No AI calls in this window."
        />
      </Card>
      <Card className="gap-2">
        <h2 className="font-heading text-base font-bold">Latest {RECENT} generations</h2>
        <DataTable
          label="Latest AI generations"
          columns={generations}
          rows={recent ?? []}
          rowKey={(c) => c.id}
          path="/admin/ai-usage"
          params={p}
          prefix="g."
          minWidth="44rem"
          empty="No generations yet."
        />
      </Card>
    </>
  )
}

type Params = Promise<SearchParams>

async function Toggle({ params }: { params: Params }) {
  await connection()
  const { user } = await requireStaff("ai")
  if (!can(user, "roles")) return null
  const p = await params
  return (
    <InternalToggle path="/admin/ai-usage" query="" included={includeInternal({ internal: one(p.internal) }, user)} />
  )
}

export default function AiUsagePage({ searchParams }: { searchParams: Params }) {
  return (
    <>
      <PageHeader
        title="AI usage"
        description={`Spend per account and daily totals per task for the last ${DAYS} days (Lagos time).`}
      />
      <Suspense fallback={null}>
        <Toggle params={searchParams} />
      </Suspense>
      <Suspense fallback={<LoadingSkeleton label="Loading spend" />}>
        <PerUser params={searchParams} />
      </Suspense>
      <h2 className="font-heading text-base font-bold">Daily totals per task</h2>
      <Suspense fallback={<LoadingSkeleton label="Loading daily totals" />}>
        <UsageTables params={searchParams} />
      </Suspense>
    </>
  )
}
