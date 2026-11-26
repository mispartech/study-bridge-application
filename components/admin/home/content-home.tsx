import Link from "next/link"
import { Suspense } from "react"

import { DataTable, type Column } from "@/components/admin/data-table"
import { KpiGrid, KpiTile } from "@/components/admin/kpi-tile"
import { PageHeader } from "@/components/admin/page-header"
import { LoadingSkeleton } from "@/components/admin/states"
import { Card } from "@/components/ui/card"
import type { SearchParams } from "@/lib/admin/table"
import { serviceClient } from "@/lib/db/service"
import { FRESH_DAYS } from "@/lib/freshness"

const nf = new Intl.NumberFormat("en-GB")
const DAY_MS = 86_400_000
/** "Nearing staleness": turns amber for students within this many days. */
export const SOON_DAYS = 14

const QUEUE_LABEL: Record<string, string> = {
  programme: "Programmes",
  city_cost: "City costs",
  health_cover: "Health plans",
}

const TABLES = [
  ["programme", "Programmes"],
  ["university", "Universities"],
  ["city_cost", "City costs"],
  ["visa_rule", "Visa rules"],
  ["scholarship", "Scholarships"],
  ["cost_estimate", "Flights and health"],
] as const

type Freshness = { key: string; label: string; soon: number; aging: number }

const COLUMNS: Column<Freshness>[] = [
  { key: "label", header: "Records", cell: (r) => r.label },
  {
    key: "soon",
    header: `Turn amber within ${SOON_DAYS} days`,
    align: "right",
    cell: (r) => nf.format(r.soon),
    sort: (r) => r.soon,
  },
  {
    key: "aging",
    header: `Already over ${FRESH_DAYS} days`,
    align: "right",
    cell: (r) => nf.format(r.aging),
    sort: (r) => r.aging,
  },
]

/** The data editor's home: what is waiting for review, open error reports, and records about to age. */
export function ContentHome({ params, now }: { params: SearchParams; now: Date }) {
  return (
    <>
      <PageHeader title="Content desk" description="What needs a data editor today." />
      <Suspense fallback={<LoadingSkeleton rows={4} label="Loading the content desk" />}>
        <ContentData params={params} now={now} />
      </Suspense>
    </>
  )
}

async function ContentData({ params, now }: { params: SearchParams; now: Date }) {
  const db = serviceClient()
  const agingFrom = new Date(now.getTime() - FRESH_DAYS * DAY_MS).toISOString()
  const soonFrom = new Date(now.getTime() - (FRESH_DAYS - SOON_DAYS) * DAY_MS).toISOString()
  const [queue, reports, ...counts] = await Promise.all([
    db.from("review_queue").select("table_name").eq("status", "pending"),
    db.from("error_report").select("id", { count: "exact", head: true }).eq("status", "open"),
    ...TABLES.flatMap(([table]) => [
      db
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("is_demo", false)
        .lt("last_verified_at", soonFrom)
        .gte("last_verified_at", agingFrom),
      db
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("is_demo", false)
        .lt("last_verified_at", agingFrom),
    ]),
  ])
  const byType = new Map<string, number>()
  for (const r of queue.data ?? []) byType.set(r.table_name, (byType.get(r.table_name) ?? 0) + 1)
  const freshness: Freshness[] = TABLES.map(([key, label], i) => ({
    key,
    label,
    soon: counts[i * 2]?.count ?? 0,
    aging: counts[i * 2 + 1]?.count ?? 0,
  }))

  return (
    <>
      <KpiGrid columns={3}>
        <KpiTile
          label="Waiting for review"
          value={
            <Link href="/admin/review" className="underline-offset-4 hover:underline">
              {nf.format(queue.data?.length ?? 0)}
            </Link>
          }
          testId="home-review-count"
          detail={
            byType.size === 0
              ? "Nothing waiting"
              : [...byType].map(([t, n]) => `${QUEUE_LABEL[t] ?? t} ${nf.format(n)}`).join(" · ")
          }
        />
        <KpiTile
          label="Open error reports"
          value={
            <Link href="/admin/reports" className="underline-offset-4 hover:underline">
              {nf.format(reports.count ?? 0)}
            </Link>
          }
          testId="home-error-reports"
          detail="Reported by students"
        />
        <KpiTile
          label={`Turning amber within ${SOON_DAYS} days`}
          value={nf.format(freshness.reduce((n, r) => n + r.soon, 0))}
          detail={`Students see records over ${FRESH_DAYS} days old as "check the official page".`}
        />
      </KpiGrid>
      <Card className="gap-2">
        <h2 className="font-heading text-base font-bold">Freshness by record type</h2>
        <DataTable
          label="Freshness by record type"
          columns={COLUMNS}
          rows={freshness}
          rowKey={(r) => r.key}
          path="/admin"
          params={params}
          minWidth="28rem"
        />
      </Card>
    </>
  )
}
