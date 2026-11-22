import Link from "next/link"
import { connection } from "next/server"

import { InternalToggle } from "@/components/admin/internal-toggle"
import { RangeFilter } from "@/components/admin/range-filter"
import { Card } from "@/components/ui/card"
import { DISMISS_LABEL } from "@/lib/activity/events"
import { includeInternal } from "@/lib/admin/internal"
import { loadOverview, type TargetCount } from "@/lib/admin/overview"
import { parseRange } from "@/lib/admin/range"
import { can } from "@/lib/auth/roles"
import { requireStaff } from "@/lib/auth/staff-page"
import { fieldLabel } from "@/lib/match/labels"

const nf = new Intl.NumberFormat("en-GB")
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`)

function Bars({ rows, label }: { rows: { key: string; n: number }[]; label: (key: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.n))
  if (!rows.length) return <p className="text-sm text-muted-foreground">No searches in this range.</p>
  return (
    <ul className="flex flex-col gap-1.5">
      {rows.slice(0, 8).map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_3rem] items-center gap-2 text-sm">
          <span className="truncate">{label(r.key)}</span>
          <span className="h-2.5 rounded-full bg-primary" style={{ width: `${(r.n / max) * 100}%` }} aria-hidden />
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

async function Overview({
  params,
  internal,
  canToggle,
}: {
  params: { range?: string; from?: string; to?: string }
  internal: boolean
  canToggle: boolean
}) {
  const now = new Date()
  const range = parseRange(params, now)
  const o = await loadOverview(range, now, internal)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="font-heading text-xl font-bold">Overview</h1>
        <p className="text-sm text-muted-foreground">
          {range.label}. People are counted once per step; anonymous visitors only if they agreed to analytics.
        </p>
      </div>
      <RangeFilter path="/admin" range={range} exportHref={`/api/admin/export?dataset=funnel&${range.query}`} />
      {canToggle && <InternalToggle path="/admin" query={range.query} included={internal} />}

      <Card className="gap-2">
        <h2 className="font-heading text-base font-bold">Funnel</h2>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Funnel">
          <table className="w-full min-w-[28rem] text-left text-sm tabular-nums">
            <thead className="text-muted-foreground">
              <tr>
                <th scope="col" className="py-1.5 pr-4 font-medium">
                  Step
                </th>
                <th scope="col" className="py-1.5 pr-4 text-right font-medium">
                  People
                </th>
                <th scope="col" className="py-1.5 text-right font-medium">
                  From previous step
                </th>
              </tr>
            </thead>
            <tbody>
              {o.funnel.map((s) => (
                <tr key={s.key} data-testid="funnel-step" className="border-t border-border">
                  <td className="py-1.5 pr-4">{s.label}</td>
                  <td className="py-1.5 pr-4 text-right">{nf.format(s.people)}</td>
                  <td className="py-1.5 text-right">{pct(s.fromPrevious)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="gap-2">
        <h2 className="font-heading text-base font-bold">At a glance</h2>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Headline numbers">
          <table className="w-full min-w-[28rem] text-left text-sm tabular-nums">
            <thead className="text-muted-foreground">
              <tr>
                {["", "Today", "7 days", "30 days"].map((h) => (
                  <th key={h} scope="col" className="py-1.5 pr-4 font-medium last:pr-0">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {o.kpis.map((k) => (
                <tr key={k.label} data-testid="kpi" className="border-t border-border">
                  <td className="py-1.5 pr-4">{k.label}</td>
                  <td className="py-1.5 pr-4">{k.today}</td>
                  <td className="py-1.5 pr-4">{k.week}</td>
                  <td className="py-1.5">{k.month}</td>
                </tr>
              ))}
              <tr className="border-t border-border">
                <td className="py-1.5 pr-4">
                  <Link href="/admin/review" className="underline underline-offset-4">
                    Waiting for review
                  </Link>
                </td>
                <td colSpan={3} className="py-1.5" data-testid="pending-count">
                  {nf.format(o.openReview)} now
                </td>
              </tr>
            </tbody>
          </table>
        </div>
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
    </div>
  )
}

/** Data editors see their queues; admins and support see the overview. */
async function ContentHome({ denied }: { denied: boolean }) {
  return (
    <div className="flex flex-col gap-3">
      {denied && <DeniedNote />}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="gap-1">
          <h1 className="font-heading text-lg font-bold">
            <Link href="/admin/review">Review queue</Link>
          </h1>
        </Card>
        <Card className="gap-1">
          <h2 className="font-heading text-lg font-bold">
            <Link href="/admin/reports">Error reports</Link>
          </h2>
        </Card>
      </div>
    </div>
  )
}

function DeniedNote() {
  return (
    <p role="alert" className="rounded-button bg-warning-tint p-3 text-sm text-warning-strong">
      Your role doesn&apos;t include that page. Ask an admin if you need it.
    </p>
  )
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string; range?: string; from?: string; to?: string; internal?: string }>
}) {
  await connection()
  const { user } = await requireStaff()
  const params = await searchParams
  if (!can(user, "overview")) return <ContentHome denied={Boolean(params.denied)} />
  return (
    <div className="flex flex-col gap-3">
      {params.denied && <DeniedNote />}
      <Overview params={params} internal={includeInternal(params, user)} canToggle={can(user, "roles")} />
    </div>
  )
}
