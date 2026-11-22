import { connection } from "next/server"

import { Card } from "@/components/ui/card"
import { envStatus } from "@/lib/admin/env"
import { requireStaff } from "@/lib/auth/staff-page"
import { serviceClient } from "@/lib/db/service"
import { emailLive } from "@/lib/email/send"
import { cn } from "@/lib/utils"

const nf = new Intl.NumberFormat("en-GB")
const time = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") : "—")
/** ISO time `days` ago. Read per request, after connection(). */
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()

/** Is everything running? Scheduled jobs, ingestion, email delivery and environment health. */
export default async function Page() {
  await connection()
  await requireStaff("settings")
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
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-xl font-bold">System</h1>

      <Card className="gap-2">
        <h2 className="font-heading text-base font-bold">Scheduled jobs</h2>
        <p className="text-xs text-muted-foreground">Reminders run daily at 07:00 UTC, exchange rates at 06:00 UTC.</p>
        {(runs.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No runs recorded yet.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {(runs.data ?? []).map((r) => (
              <li key={r.id} data-testid="cron-run" className="flex flex-wrap gap-x-2">
                <span className="text-muted-foreground tabular-nums">{time(r.started_at)}</span>
                <strong>{r.job}</strong>
                <span className={r.ok ? "text-success-strong" : "text-danger-strong"}>{r.ok ? "ok" : "failed"}</span>
                <span className="text-xs text-muted-foreground">{JSON.stringify(r.summary)}</span>
              </li>
            ))}
          </ul>
        )}
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
              <span
                className={cn(
                  "w-16 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-medium",
                  e.set ? "bg-success/15 text-success-strong" : "bg-danger/15 text-danger-strong"
                )}
              >
                {e.set ? "set" : "missing"}
              </span>
              <span className="min-w-0 break-all font-mono text-xs">{e.name}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
