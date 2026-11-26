import { connection } from "next/server"

import { DataTable, type Column } from "@/components/admin/data-table"
import { MarketRateForm } from "@/components/admin/market-rate-form"
import { PageHeader } from "@/components/admin/page-header"
import { StatusBadge } from "@/components/admin/status-badge"
import { Card } from "@/components/ui/card"
import type { SearchParams } from "@/lib/admin/table"
import { serviceClient } from "@/lib/db/service"
import { requireStaff } from "@/lib/auth/staff-page"

const dated = (date: string) =>
  new Date(date).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" })

type Rate = {
  base: string
  rate: number
  rate_kind: string
  fetched_at: string
  source_url: string | null
  entered_by: string | null
}

const COLUMNS: Column<Rate & { key: string }>[] = [
  { key: "base", header: "Currency", sort: (r) => r.base, cell: (r) => r.base },
  {
    key: "kind",
    header: "Kind",
    sort: (r) => r.rate_kind,
    cell: (r) =>
      r.rate_kind === "official" ? (
        <StatusBadge tone="neutral">Reference</StatusBadge>
      ) : (
        <StatusBadge tone="info">Market</StatusBadge>
      ),
  },
  { key: "rate", header: "Naira per unit", align: "right", sort: (r) => Number(r.rate), cell: (r) => r.rate },
  { key: "asof", header: "As of", nowrap: true, sort: (r) => r.fetched_at, cell: (r) => dated(r.fetched_at) },
  {
    key: "source",
    header: "Source",
    cell: (r) => (
      <>
        {r.source_url ? (
          <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="underline">
            Link
          </a>
        ) : (
          "None"
        )}
        {r.entered_by ? " (admin)" : ""}
      </>
    ),
  },
]

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection()
  await requireStaff("content")
  const params = await searchParams
  const { data } = await serviceClient()
    .from("fx_rate")
    .select("base, rate, rate_kind, fetched_at, source_url, entered_by")
    .eq("is_demo", false)
    .order("fetched_at", { ascending: false })
    .limit(40)
  const rows = (data ?? []).map((r, i) => ({ ...r, key: String(i) }))
  return (
    <>
      <PageHeader
        title="Exchange rates"
        description="The reference rate refreshes from ExchangeRate-API. Enter the market rate weekly, with its source."
      />
      <MarketRateForm />
      <Card className="gap-2">
        <h2 className="font-heading text-base font-bold">Recent rates</h2>
        <DataTable
          label="Recent rates"
          columns={COLUMNS}
          rows={rows}
          rowKey={(r) => r.key}
          rowProps={() => ({ "data-testid": "fx-row" })}
          path="/admin/fx"
          params={params}
          minWidth="36rem"
          empty="No rates yet."
        />
      </Card>
    </>
  )
}
