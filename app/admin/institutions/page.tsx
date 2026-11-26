import Link from "next/link"
import { connection } from "next/server"

import { InstitutionForm } from "@/components/admin/career-forms"
import { DataTable, type Column } from "@/components/admin/data-table"
import { DetailDrawer } from "@/components/admin/detail-drawer"
import { PageHeader } from "@/components/admin/page-header"
import { StatusBadge } from "@/components/admin/status-badge"
import { FreshnessBadge } from "@/components/ui/freshness-badge"
import { tableHref, type SearchParams } from "@/lib/admin/table"
import { requireStaff } from "@/lib/auth/staff-page"
import type { Tables } from "@/lib/db/database.types"
import { serviceClient } from "@/lib/db/service"

type Institution = Tables<"university">
const TYPE = { university: "University", public_college: "Public college", private_college: "Private college" }

/** Universities and colleges, with the work-permit eligibility an editor has checked on the official list. */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection()
  await requireStaff("content")
  const params = await searchParams
  const now = new Date()
  const { data } = await serviceClient().from("university").select("*").eq("is_demo", false).order("name")
  const rows = data ?? []
  const editing = rows.find((u) => u.id === params.edit)
  const columns: Column<Institution>[] = [
    {
      key: "name",
      header: "Institution",
      sort: (u) => u.name,
      cell: (u) => (
        <Link
          href={tableHref("/admin/institutions", params, { edit: u.id })}
          scroll={false}
          className="font-medium underline underline-offset-4"
        >
          {u.name}
        </Link>
      ),
    },
    { key: "where", header: "Where", sort: (u) => u.region, cell: (u) => `${u.city}, ${u.region}, ${u.country}` },
    { key: "type", header: "Type", cell: (u) => TYPE[u.institution_type as keyof typeof TYPE] },
    { key: "dli", header: "DLI number", cell: (u) => u.dli_number ?? "—" },
    {
      key: "permit",
      header: "Work permit",
      sort: (u) => u.pgwp_eligible,
      cell: (u) => (
        <StatusBadge tone={u.pgwp_eligible === "yes" ? "success" : u.pgwp_eligible === "no" ? "danger" : "neutral"}>
          {u.pgwp_eligible === "unknown" ? "Not checked" : u.pgwp_eligible === "yes" ? "Eligible" : "Not eligible"}
        </StatusBadge>
      ),
    },
    {
      key: "checked",
      header: "Checked",
      cell: (u) =>
        u.pgwp_checked_at ? (
          <FreshnessBadge
            lastVerifiedAt={u.pgwp_checked_at}
            now={now}
            sourceUrl={u.pgwp_source_url ?? undefined}
            size="sm"
          />
        ) : (
          "—"
        ),
    },
  ]
  return (
    <>
      <PageHeader
        title="Institutions"
        description="Check each Canadian institution on the IRCC list before marking it eligible. Until then, its programmes never show that they lead to a work permit."
      />
      <DataTable
        label="Institutions"
        columns={columns}
        rows={rows}
        rowKey={(u) => u.id}
        rowProps={() => ({ "data-testid": "institution-row" })}
        path="/admin/institutions"
        params={params}
        minWidth="52rem"
        empty="No institutions yet."
      />
      {editing && (
        <DetailDrawer title={editing.name} closeHref={tableHref("/admin/institutions", params, { edit: null })}>
          <InstitutionForm key={editing.id} institution={editing} />
        </DetailDrawer>
      )}
    </>
  )
}
