import { connection } from "next/server"

import { DataTable, type Column } from "@/components/admin/data-table"
import { FilterBar } from "@/components/admin/filter-bar"
import { KpiGrid, KpiTile } from "@/components/admin/kpi-tile"
import { PageHeader } from "@/components/admin/page-header"
import { RangeFilter } from "@/components/admin/range-filter"
import { RefundButton } from "@/components/admin/refund-button"
import { ErrorState } from "@/components/admin/states"
import { StatusBadge, toneFor } from "@/components/admin/status-badge"
import { parseRange } from "@/lib/admin/range"
import type { SearchParams } from "@/lib/admin/table"
import { requireStaff } from "@/lib/auth/staff-page"
import { serviceClient } from "@/lib/db/service"

const nf = new Intl.NumberFormat("en-GB")
const time = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") : "—")
const money = (minor: number, currency: string) => `${currency} ${nf.format(Math.round(minor / 100))}`
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

type Payment = {
  reference: string
  amount_minor: number
  currency: string
  status: string
  created_at: string
  paid_at: string | null
  refunded_at: string | null
}

const COLUMNS: Column<Payment>[] = [
  { key: "started", header: "Started", nowrap: true, sort: (p) => p.created_at, cell: (p) => time(p.created_at) },
  {
    key: "reference",
    header: "Reference",
    sort: (p) => p.reference,
    cell: (p) => <span className="font-mono text-xs break-all">{p.reference}</span>,
  },
  {
    key: "amount",
    header: "Amount",
    align: "right",
    nowrap: true,
    sort: (p) => p.amount_minor,
    cell: (p) => money(p.amount_minor, p.currency),
  },
  {
    key: "status",
    header: "Status",
    sort: (p) => p.status,
    cell: (p) => <StatusBadge tone={toneFor(p.status)}>{p.status}</StatusBadge>,
  },
  { key: "paid", header: "Paid", nowrap: true, sort: (p) => p.paid_at, cell: (p) => time(p.paid_at) },
  { key: "refunded", header: "Refunded", nowrap: true, sort: (p) => p.refunded_at, cell: (p) => time(p.refunded_at) },
  {
    key: "actions",
    header: "Actions",
    fixed: true,
    cell: (p) => (p.status === "paid" ? <RefundButton reference={p.reference} /> : null),
  },
]

/** Paystack transactions. Refunds are admin-only and audited. */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection()
  await requireStaff("payments")
  const params = await searchParams
  const range = parseRange({ range: one(params.range), from: one(params.from), to: one(params.to) }, new Date())
  const { data, error } = await serviceClient()
    .from("payment")
    .select("reference, user_id, amount_minor, currency, status, created_at, paid_at, refunded_at")
    .gte("created_at", range.from.toISOString())
    .lt("created_at", range.to.toISOString())
    .order("created_at", { ascending: false })
    .limit(500)
  const rows = data ?? []
  const byStatus = new Map<string, { n: number; totals: Map<string, number> }>()
  for (const p of rows) {
    const s = byStatus.get(p.status) ?? { n: 0, totals: new Map() }
    s.n += 1
    s.totals.set(p.currency, (s.totals.get(p.currency) ?? 0) + p.amount_minor)
    byStatus.set(p.status, s)
  }
  return (
    <>
      <PageHeader title="Payments" description="Paystack is in test mode: no real card has been charged." />
      <FilterBar>
        <RangeFilter path="/admin/payments" range={range} />
      </FilterBar>
      <KpiGrid>
        {["paid", "pending", "failed", "refunded"].map((status) => {
          const s = byStatus.get(status)
          return (
            <KpiTile
              key={status}
              label={status[0]!.toUpperCase() + status.slice(1)}
              value={s?.n ?? 0}
              detail={s ? [...s.totals].map(([c, m]) => money(m, c)).join(", ") : "—"}
            />
          )
        })}
      </KpiGrid>
      {error && <ErrorState title="Could not load payments" message={error.message} />}
      <DataTable
        label="Payments"
        columns={COLUMNS}
        rows={rows}
        rowKey={(p) => p.reference}
        rowProps={() => ({ "data-testid": "payment-row" })}
        path="/admin/payments"
        params={params}
        defaultSort="started"
        minWidth="48rem"
        empty="No payments in this range."
      />
    </>
  )
}
