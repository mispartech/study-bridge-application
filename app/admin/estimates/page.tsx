import { connection } from "next/server"

import { DataTable, type Column } from "@/components/admin/data-table"
import { EstimateForm } from "@/components/admin/estimate-form"
import { PageHeader } from "@/components/admin/page-header"
import { Card } from "@/components/ui/card"
import type { SearchParams } from "@/lib/admin/table"
import { serviceClient } from "@/lib/db/service"
import { formatShort, type Currency } from "@/lib/money"
import { requireStaff } from "@/lib/auth/staff-page"

const EVIDENCE_LINK_SECONDS = 600

type Estimate = {
  id: string
  item: string
  city: string | null
  region: string | null
  country: string
  amount_minor: number
  currency: string
  per_year: boolean
  observed_on: string | null
  confidence: string
  source_url: string
  evidence: string | null
}

const COLUMNS: Column<Estimate>[] = [
  {
    key: "item",
    header: "Estimate",
    sort: (r) => r.item,
    cell: (r) => `${r.item === "flights" ? "Flights" : "Health cover"}: ${r.city ?? r.region ?? r.country}`,
  },
  {
    key: "amount",
    header: "Amount",
    align: "right",
    nowrap: true,
    sort: (r) => r.amount_minor,
    cell: (r) => `${formatShort(BigInt(r.amount_minor), r.currency as Currency)}${r.per_year ? " a year" : ""}`,
  },
  { key: "quoted", header: "Quoted", nowrap: true, sort: (r) => r.observed_on, cell: (r) => r.observed_on ?? "—" },
  { key: "confidence", header: "Confidence", sort: (r) => r.confidence, cell: (r) => r.confidence },
  {
    key: "links",
    header: "Evidence",
    cell: (r) => (
      <span className="flex flex-wrap gap-x-2">
        <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="underline">
          Source
        </a>
        {r.evidence && (
          <a href={r.evidence} target="_blank" rel="noopener noreferrer" className="underline">
            Screenshot
          </a>
        )}
      </span>
    ),
  },
]

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection()
  await requireStaff("content")
  const params = await searchParams
  const db = serviceClient()
  const { data } = await db.from("cost_estimate").select("*").eq("is_demo", false).order("country").order("item")
  const rows = await Promise.all(
    (data ?? []).map(async (row) => {
      if (!row.evidence_path) return { ...row, evidence: null }
      const { data: link } = await db.storage.from("evidence").createSignedUrl(row.evidence_path, EVIDENCE_LINK_SECONDS)
      return { ...row, evidence: link?.signedUrl ?? null }
    })
  )
  return (
    <>
      <PageHeader
        title="Flights and health cover"
        description="Flight figures are the median of dated quotes, with a screenshot. They show as estimates to students."
      />
      <EstimateForm />
      <Card className="gap-2">
        <h2 className="font-heading text-base font-bold">Current estimates</h2>
        <DataTable
          label="Current estimates"
          columns={COLUMNS}
          rows={rows}
          rowKey={(r) => r.id}
          rowProps={() => ({ "data-testid": "estimate-row" })}
          path="/admin/estimates"
          params={params}
          minWidth="40rem"
          empty="No estimates yet."
        />
      </Card>
    </>
  )
}
