import { connection } from "next/server"

import { DataTable, type Column } from "@/components/admin/data-table"
import { FilterBar } from "@/components/admin/filter-bar"
import { KpiGrid, KpiTile } from "@/components/admin/kpi-tile"
import { PageHeader } from "@/components/admin/page-header"
import { RangeFilter } from "@/components/admin/range-filter"
import { ReportRowActions } from "@/components/admin/report-row-actions"
import { ErrorState } from "@/components/admin/states"
import { StatusBadge, toneFor } from "@/components/admin/status-badge"
import { parseRange } from "@/lib/admin/range"
import type { SearchParams } from "@/lib/admin/table"
import { can } from "@/lib/auth/roles"
import { requireStaff } from "@/lib/auth/staff-page"
import { serviceClient } from "@/lib/db/service"

const LIMIT = 200
const time = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") : "—")
const pct = (n: number, d: number) => (d === 0 ? "—" : `${Math.round((n / d) * 100)}%`)
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

type Row = {
  id: string
  email: string
  created_at: string
  delivery_status: string
  claimed_at: string | null
  reminders_consent: boolean
  marketing_consent: boolean
}

/** Reports emailed to one-time visitors: delivery, consents, and how many became accounts. */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection()
  const { user } = await requireStaff("users.read")
  const params = await searchParams
  const range = parseRange({ range: one(params.range), from: one(params.from), to: one(params.to) }, new Date())
  const { data, error } = await serviceClient()
    .from("report")
    .select("id, email, created_at, delivery_status, claimed_at, reminders_consent, marketing_consent")
    .gte("created_at", range.from.toISOString())
    .lt("created_at", range.to.toISOString())
    .order("created_at", { ascending: false })
    .limit(LIMIT)
  const rows: Row[] = data ?? []
  const claimed = rows.filter((r) => r.claimed_at).length
  const failed = rows.filter((r) => r.delivery_status === "failed").length
  const canManage = can(user, "users.manage")
  const canErase = can(user, "users.erase")

  const columns: Column<Row>[] = [
    { key: "sent", header: "Sent", nowrap: true, sort: (r) => r.created_at, cell: (r) => time(r.created_at) },
    { key: "email", header: "Email", sort: (r) => r.email, cell: (r) => <span className="break-all">{r.email}</span> },
    {
      key: "delivery",
      header: "Delivery",
      sort: (r) => r.delivery_status,
      cell: (r) => <StatusBadge tone={toneFor(r.delivery_status)}>{r.delivery_status}</StatusBadge>,
    },
    { key: "claimed", header: "Opened as account", sort: (r) => r.claimed_at, cell: (r) => time(r.claimed_at) },
    { key: "reminders", header: "Reminders", cell: (r) => (r.reminders_consent ? "yes" : "no") },
    { key: "updates", header: "Updates", cell: (r) => (r.marketing_consent ? "yes" : "no") },
    {
      key: "actions",
      header: "Actions",
      fixed: true,
      cell: (r) => <ReportRowActions id={r.id} canManage={canManage} canErase={canErase} />,
    },
  ]

  return (
    <>
      <PageHeader
        title="Emailed reports"
        description="Reports sent to visitors: delivery, consents, and how many became accounts."
      />
      <FilterBar>
        <RangeFilter
          path="/admin/emailed-reports"
          range={range}
          exportHref={`/api/admin/export?dataset=reports&${range.query}`}
        />
      </FilterBar>
      <KpiGrid columns={3}>
        <KpiTile label="Reports sent" value={String(rows.length)} testId="report-metric" />
        <KpiTile
          label="Opened as accounts"
          value={`${claimed} (${pct(claimed, rows.length)})`}
          testId="report-metric"
        />
        <KpiTile label="Failed to send" value={String(failed)} testId="report-metric" />
      </KpiGrid>
      {error && <ErrorState title="Could not load reports" message={error.message} />}
      <DataTable
        label="Emailed reports"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        rowProps={() => ({ "data-testid": "report-row" })}
        path="/admin/emailed-reports"
        params={params}
        defaultSort="sent"
        minWidth="56rem"
        empty="No reports in this range."
      />
    </>
  )
}
