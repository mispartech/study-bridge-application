import { connection } from "next/server"

import { FieldImportForm, LinkForm, LinkReview, OccupationForm } from "@/components/admin/career-forms"
import { DataTable, type Column } from "@/components/admin/data-table"
import { KpiGrid, KpiTile } from "@/components/admin/kpi-tile"
import { PageHeader } from "@/components/admin/page-header"
import { EmptyState } from "@/components/admin/states"
import { StatusBadge } from "@/components/admin/status-badge"
import { Card } from "@/components/ui/card"
import { FreshnessBadge } from "@/components/ui/freshness-badge"
import { DEMAND_TYPE_LABEL } from "@/lib/admin/careers"
import type { SearchParams } from "@/lib/admin/table"
import { requireStaff } from "@/lib/auth/staff-page"
import type { Tables } from "@/lib/db/database.types"
import { serviceClient } from "@/lib/db/service"
import { STALE_DAYS } from "@/lib/match/careers"

const nf = new Intl.NumberFormat("en-GB")
const LINKS_SHOWN = 50

type Occupation = Tables<"occupation">
type Demand = Tables<"occupation_demand"> & { occupation: Pick<Occupation, "code" | "title" | "country"> }
type Field = Tables<"work_permit_field">

/** Occupations, regional demand, work-permit fields, and the links that connect programmes to careers. */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection()
  await requireStaff("content")
  const params = await searchParams
  const now = new Date()
  const db = serviceClient()
  const [occupations, demand, fields, suggested, approved, programmes] = await Promise.all([
    db.from("occupation").select("*").order("code"),
    db.from("occupation_demand").select("*, occupation!inner(code, title, country)"),
    db.from("work_permit_field").select("*").order("code"),
    db
      .from("programme_occupation")
      .select("programme_id, occupation_id, rationale, programme!inner(title), occupation!inner(code, title)", {
        count: "exact",
      })
      .eq("status", "suggested")
      .order("created_at")
      .limit(LINKS_SHOWN),
    db.from("programme_occupation").select("programme_id").eq("status", "approved"),
    db.from("programme").select("id, title, university!inner(name, country)").eq("is_demo", false).order("title"),
  ])
  const linked = new Set((approved.data ?? []).map((l) => l.programme_id))
  const live = programmes.data ?? []
  const share = live.length ? Math.round((live.filter((p) => linked.has(p.id)).length / live.length) * 100) : 0

  const verified = <T extends { last_verified_at: string; source_url: string }>(): Column<T> => ({
    key: "verified",
    header: "Verified",
    sort: (r) => r.last_verified_at,
    cell: (r) => <FreshnessBadge lastVerifiedAt={r.last_verified_at} now={now} sourceUrl={r.source_url} size="sm" />,
  })
  const occupationColumns: Column<Occupation>[] = [
    { key: "code", header: "Code", sort: (o) => o.code, cell: (o) => `${o.country} ${o.code}` },
    { key: "title", header: "Occupation", sort: (o) => o.title, cell: (o) => o.title },
    verified<Occupation>(),
  ]
  const demandColumns: Column<Demand>[] = [
    {
      key: "occupation",
      header: "Occupation",
      sort: (d) => d.occupation.title,
      cell: (d) => `${d.occupation.code} ${d.occupation.title}`,
    },
    { key: "where", header: "Where", cell: (d) => d.region || d.occupation.country },
    {
      key: "what",
      header: "Demand",
      cell: (d) => `${DEMAND_TYPE_LABEL[d.source_type as keyof typeof DEMAND_TYPE_LABEL]}: ${d.label}`,
    },
    { key: "until", header: "Until", sort: (d) => d.valid_to, cell: (d) => d.valid_to ?? "No end" },
    verified<Demand>(),
  ]
  const today = now.toISOString().slice(0, 10)
  const fieldColumns: Column<Field>[] = [
    { key: "code", header: "Code", sort: (f) => f.code, cell: (f) => `${f.country} ${f.code}` },
    { key: "title", header: "Field", sort: (f) => f.title, cell: (f) => f.title },
    { key: "category", header: "Category", sort: (f) => f.category, cell: (f) => f.category },
    {
      key: "status",
      header: "Eligible",
      cell: (f) => (f.eligible_to && f.eligible_to < today ? <StatusBadge>Ended {f.eligible_to}</StatusBadge> : "Yes"),
    },
    verified<Field>(),
  ]

  return (
    <>
      <PageHeader
        title="Careers and permits"
        description={`Which careers programmes lead to, where those are in demand, and which fields qualify for a work permit. Records over ${STALE_DAYS} days old stop counting until re-verified.`}
      />
      <KpiGrid columns={3}>
        <KpiTile label="Live programmes linked" value={`${share}%`} detail="Target: 80% of pilot programmes" />
        <KpiTile label="Links to review" value={nf.format(suggested.count ?? 0)} testId="links-to-review" />
        <KpiTile label="Work-permit fields" value={nf.format(fields.data?.length ?? 0)} />
      </KpiGrid>

      <Card className="gap-3">
        <h2 className="font-heading text-base font-bold">Links to review</h2>
        {suggested.data?.length ? (
          <LinkReview
            links={suggested.data.map((l) => ({
              programme_id: l.programme_id,
              occupation_id: l.occupation_id,
              label: `${l.programme.title} → ${l.occupation.code} ${l.occupation.title}`,
              rationale: l.rationale,
            }))}
          />
        ) : (
          <EmptyState title="No suggestions waiting" />
        )}
      </Card>
      <Card className="gap-3">
        <h2 className="font-heading text-base font-bold">Link a programme</h2>
        <LinkForm
          programmes={live.map((p) => ({
            id: p.id,
            label: `${p.title} · ${p.university.name}`,
            country: p.university.country,
          }))}
          occupations={(occupations.data ?? []).map((o) => ({
            id: o.id,
            label: `${o.code} ${o.title}`,
            country: o.country,
          }))}
        />
      </Card>
      <Card className="gap-3">
        <h2 className="font-heading text-base font-bold">Add an occupation or demand</h2>
        <OccupationForm />
      </Card>
      <Card className="gap-2">
        <h2 className="font-heading text-base font-bold">Demand</h2>
        <DataTable
          label="Demand"
          columns={demandColumns}
          rows={demand.data ?? []}
          rowKey={(d) => d.id}
          rowProps={() => ({ "data-testid": "demand-row" })}
          path="/admin/careers"
          params={params}
          prefix="d."
          empty="No demand recorded yet."
        />
      </Card>
      <Card className="gap-2">
        <h2 className="font-heading text-base font-bold">Occupations</h2>
        <DataTable
          label="Occupations"
          columns={occupationColumns}
          rows={occupations.data ?? []}
          rowKey={(o) => o.id}
          rowProps={() => ({ "data-testid": "occupation-row" })}
          path="/admin/careers"
          params={params}
          prefix="o."
          empty="No occupations yet."
        />
      </Card>
      <Card className="gap-3">
        <h2 className="font-heading text-base font-bold">Work-permit fields of study</h2>
        <FieldImportForm />
        <DataTable
          label="Work-permit fields"
          columns={fieldColumns}
          rows={fields.data ?? []}
          rowKey={(f) => f.id}
          path="/admin/careers"
          params={params}
          prefix="f."
          empty="No fields yet."
        />
      </Card>
    </>
  )
}
