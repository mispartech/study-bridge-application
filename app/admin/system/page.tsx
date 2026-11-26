import { connection } from "next/server"

import { DataTable, type Column } from "@/components/admin/data-table"
import { PageHeader } from "@/components/admin/page-header"
import { StatusBadge } from "@/components/admin/status-badge"
import { Card } from "@/components/ui/card"
import { envStatus } from "@/lib/admin/env"
import { requireStaff } from "@/lib/auth/staff-page"
import { serviceClient } from "@/lib/db/service"
import { emailLive } from "@/lib/email/send"
import type { SearchParams } from "@/lib/admin/table"
import type { Json } from "@/lib/db/database.types"

const nf = new Intl.NumberFormat("en-GB")
const time = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") : "—")
/** ISO time `days` ago. Read per request, after connection(). */
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()

type Run = {
  id: number
  job: string
  started_at: string
  finished_at: string | null
  ok: boolean | null
  summary: Json
}

const RUNS: Column<Run>[] = [
  { key: "started", header: "Started (UTC)", nowrap: true, sort: (r) => r.started_at, cell: (r) => time(r.started_at) },
  { key: "job", header: "Job", sort: (r) => r.job, cell: (r) => <strong>{r.job}</strong> },
  {
    key: "result",
    header: "Result",
    fixed: true,
    cell: (r) => <StatusBadge tone={r.ok ? "success" : "danger"}>{r.ok ? "ok" : "failed"}</StatusBadge>,
  },
  {
    key: "summary",
    header: "Summary",
    cell: (r) => <span className="font-mono text-xs break-all text-muted-foreground">{JSON.stringify(r.summary)}</span>,
  },
]

/** Is everything running? Scheduled jobs, ingestion, email delivery and environment health. */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection()
  await requireStaff("settings")
  const params = await searchParams
  const db = serviceClient()
  const week = daysAgo(7)
  const month = daysAgo(30)
  const [runs, delivery, queued, changes] = await Promise.all([
    db
      .from("cron_run")
      .select("id, job, started_at, finished_at, ok, summary")
      .order("started_at", { ascending: false })
      .limit(20),
    db.from("report").select("delivery_status").gte("created_at", month),
    db.from("review_queue").select("id", { count: "exact", head: true }).gte("created_at", week),
    db
      .from("source_audit")
      .select("id", { count: "exact", head: true })
      .eq("change_detected", true)
      .gte("created_at", week),
  ])
  const statuses = new Map<string, number>()
  for (const r of delivery.data ?? []) statuses.set(r.delivery_status, (statuses.get(r.delivery_status) ?? 0) + 1)
  const env = envStatus()

  return (
    <>
      <PageHeader title="System" description="Scheduled jobs, email delivery, ingestion, errors and the environment." />

      <Card className="gap-2">
        <h2 className="font-heading text-base font-bold">Scheduled jobs</h2>
        <p className="text-xs text-muted-foreground">Reminders run daily at 07:00 UTC, exchange rates at 06:00 UTC.</p>
        <DataTable
          label="Scheduled job runs"
          columns={RUNS}
          rows={runs.data ?? []}
          rowKey={(r) => String(r.id)}
          rowProps={() => ({ "data-testid": "cron-run" })}
          path="/admin/system"
          params={params}
          minWidth="40rem"
          empty="No runs recorded yet."
        />
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="gap-1">
          <h2 className="font-heading text-base font-bold">Email (last 30 days)</h2>
          <p className="text-sm">
            Mode: <strong>{emailLive() ? "live" : "test inbox only"}</strong>
          </p>
          <p className="text-sm tabular-nums">
            {["sent", "failed", "queued"].map((s) => `${s} ${nf.format(statuses.get(s) ?? 0)}`).join(" · ")}
          </p>
        </Card>
        <Card className="gap-1">
          <h2 className="font-heading text-base font-bold">Ingestion (last 7 days)</h2>
          <p className="text-sm tabular-nums">
            {nf.format(queued.count ?? 0)} records queued for review · {nf.format(changes.count ?? 0)} changes detected
          </p>
          <p className="text-xs text-muted-foreground">
            The weekly re-check runs in the ingestion service, which needs its own host to run on a schedule.
          </p>
        </Card>
      </div>

      <Card className="gap-2">
        <h2 className="font-heading text-base font-bold">Errors</h2>
        <p className="text-sm">
          Server and browser errors go to Sentry (
          {env.find((e) => e.name === "SENTRY_DSN")?.set ? "connected" : "not set up"}). Open your Sentry project to see
          them.
        </p>
      </Card>

      <Card className="gap-2">
        <h2 className="font-heading text-base font-bold">Environment</h2>
        <p className="text-xs text-muted-foreground">
          Names only; values are never shown. Change them in Vercel, then redeploy.
        </p>
        {/* Status first, at a fixed width, so it can't be read as belonging to the next column's name. */}
        <ul className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
          {env.map((e) => (
            <li key={e.name} data-testid="env-row" className="flex items-center gap-2">
              <StatusBadge tone={e.set ? "success" : "danger"} className="w-16 justify-center">
                {e.set ? "set" : "missing"}
              </StatusBadge>
              <span className="min-w-0 font-mono text-xs break-all">{e.name}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}
