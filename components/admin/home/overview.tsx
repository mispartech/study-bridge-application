import Link from "next/link"

import { DataTable, type Column } from "@/components/admin/data-table"
import { FilterBar } from "@/components/admin/filter-bar"
import { InternalToggle } from "@/components/admin/internal-toggle"
import { KpiGrid, KpiTile } from "@/components/admin/kpi-tile"
import { PageHeader } from "@/components/admin/page-header"
import { RangeFilter } from "@/components/admin/range-filter"
import { EmptyState } from "@/components/admin/states"
import { Card } from "@/components/ui/card"
import { DISMISS_LABEL } from "@/lib/activity/events"
import type { FunnelStep } from "@/lib/admin/funnel"
import { loadOverview, type Kpi, type TargetCount } from "@/lib/admin/overview"
import { parseRange } from "@/lib/admin/range"
import type { SearchParams } from "@/lib/admin/table"
import { fieldLabel } from "@/lib/match/labels"

const nf = new Intl.NumberFormat("en-GB")
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`)
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

function Bars({ rows, label }: { rows: { key: string; n: number }[]; label: (key: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.n))
  if (!rows.length) return <p className="text-sm text-muted-foreground">No searches in this range.</p>
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.slice(0, 8).map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_3rem] items-center gap-2 text-sm">
          <span className="truncate">{label(r.key)}</span>
          <span className="h-2.5 rounded-full bg-chart-1" style={{ width: `${(r.n / max) * 100}%` }} aria-hidden />
          <span className="text-right tabular-nums">{nf.format(r.n)}</span>
        </li>
      ))}
    </ul>
  )
}

function TopList({ title, rows, reasons }: { title: string; rows: TargetCount[]; reasons?: boolean }) {
  return (
    <Card className="gap-2">
      <h2 className="font-heading text-base font-bold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing in this range.</p>
      ) : (
        <ol className="flex flex-col gap-1.5 text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col">
              <span className="flex justify-between gap-2">
                <span className="truncate">{r.title}</span>
                <span className="tabular-nums">{nf.format(r.total)}</span>
              </span>
              {reasons && Object.keys(r.reasons).length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {Object.entries(r.reasons)
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, v]) => `${DISMISS_LABEL[k as keyof typeof DISMISS_LABEL] ?? k} ${v}`)
                    .join(" · ")}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

type Step = FunnelStep

const FUNNEL: Column<Step>[] = [
  { key: "step", header: "Step", cell: (s) => s.label },
  { key: "people", header: "People", align: "right", cell: (s) => nf.format(s.people), fixed: true },
  { key: "from", header: "From previous step", align: "right", cell: (s) => pct(s.fromPrevious), fixed: true },
]

const GLANCE: Column<Kpi>[] = [
  { key: "label", header: "Measure", cell: (k) => k.label },
  { key: "today", header: "Today", align: "right", cell: (k) => k.today, fixed: true },
  { key: "week", header: "7 days", align: "right", cell: (k) => k.week, fixed: true },
  { key: "month", header: "30 days", align: "right", cell: (k) => k.month, fixed: true },
]

/** The funnel and headline numbers, for staff with the `overview` permission. */
export async function Overview({
  path,
  params,
  internal,
  canToggle,
}: {
  path: string
  params: SearchParams
  internal: boolean
  canToggle: boolean
}) {
  const now = new Date()
  const range = parseRange({ range: one(params.range), from: one(params.from), to: one(params.to) }, now)
  const o = await loadOverview(range, now, internal)
  const people = (key: string) => o.funnel.find((s) => s.key === key)?.people ?? 0
  return (
    <>
      <PageHeader
        title="Overview"
        description={`${range.label}. People are counted once per step; anonymous visitors only if they agreed to analytics.`}
      />
      <FilterBar>
        <RangeFilter path={path} range={range} exportHref={`/api/admin/export?dataset=funnel&${range.query}`} />
        {canToggle && <InternalToggle path={path} query={range.query} included={internal} />}
      </FilterBar>

      <KpiGrid columns={3}>
        <KpiTile
          label="Waiting for review"
          value={
            <Link href="/admin/review" className="underline-offset-4 hover:underline">
              {nf.format(o.openReview)}
            </Link>
          }
          detail="Records not yet live, now"
          testId="pending-count"
        />
        <KpiTile label="People who reached results" value={nf.format(people("results_viewed"))} detail={range.label} />
        <KpiTile label="Apply clicks" value={nf.format(people("apply_clicked"))} detail={range.label} />
      </KpiGrid>

      <Card className="gap-2">
        <h2 className="font-heading text-base font-bold">Funnel</h2>
        <DataTable
          label="Funnel"
          columns={FUNNEL}
          rows={o.funnel}
          rowKey={(s) => s.key}
          rowProps={() => ({ "data-testid": "funnel-step" })}
          path={path}
          params={params}
          prefix="f."
          minWidth="28rem"
        />
      </Card>

      <Card className="gap-2">
        <h2 className="font-heading text-base font-bold">At a glance</h2>
        <DataTable
          label="Headline numbers"
          columns={GLANCE}
          rows={o.kpis}
          rowKey={(k) => k.label}
          rowProps={() => ({ "data-testid": "kpi" })}
          path={path}
          params={params}
          prefix="g."
          minWidth="28rem"
          empty={<EmptyState title="No numbers yet" />}
        />
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <TopList title="Most saved" rows={o.topSaved} />
        <TopList title="Most often 'Not for me'" rows={o.topDismissed} reasons />
        <TopList title="Most apply clicks" rows={o.topApplied} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="gap-2">
          <h2 className="font-heading text-base font-bold">Courses searched</h2>
          <Bars rows={o.fields} label={(k) => (k === "any" ? "Any course" : fieldLabel(k))} />
        </Card>
        <Card className="gap-2">
          <h2 className="font-heading text-base font-bold">Countries searched</h2>
          <Bars rows={o.countries} label={(k) => (k === "any" ? "Any country" : k)} />
        </Card>
        <Card className="gap-2">
          <h2 className="font-heading text-base font-bold">Budgets (naira)</h2>
          <Bars rows={o.budgets} label={(k) => k} />
        </Card>
      </div>
    </>
  )
}
