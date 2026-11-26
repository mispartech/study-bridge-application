import Link from "next/link"
import { connection } from "next/server"

import { ApproveAllReady } from "@/components/admin/approve-all"
import { DataTable, type Column } from "@/components/admin/data-table"
import { PageHeader } from "@/components/admin/page-header"
import { EmptyState } from "@/components/admin/states"
import { StatusBadge } from "@/components/admin/status-badge"
import { Card } from "@/components/ui/card"
import { isReady } from "@/lib/admin/approve"
import { fieldChangeStats } from "@/lib/admin/field-changes"
import type { SearchParams } from "@/lib/admin/table"
import { serviceClient } from "@/lib/db/service"
import { requireStaff } from "@/lib/auth/staff-page"

type Proposed = {
  university?: { name?: string } | null
  programme?: { title?: string } | null
  city?: string
  plan_name?: string
}

/** Programmes come first: costs and health plans attach to a university that a programme approval creates. */
const GROUPS = [
  {
    tables: ["programme"],
    heading: "Programmes",
    note: "Open one, check it against the source, then Approve and publish at the bottom. This also adds the university.",
  },
  {
    tables: ["city_cost"],
    heading: "City costs",
    note: "Approve after at least one programme from the same university.",
  },
  {
    tables: ["health_cover"],
    heading: "Health plans",
    note: "Approve after at least one programme from the same university.",
  },
]

type Stat = ReturnType<typeof fieldChangeStats>[number]

const STATS: Column<Stat>[] = [
  {
    key: "field",
    header: "Field",
    sort: (s) => s.field,
    cell: (s) => <span className="font-mono text-xs">{s.field}</span>,
  },
  {
    key: "changed",
    header: "Changed by reviewers",
    align: "right",
    fixed: true,
    sort: (s) => s.rate,
    cell: (s) => `${s.changed} (${Math.round(s.rate * 100)}%)`,
  },
]

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection()
  await requireStaff("content")
  const params = await searchParams
  const { data } = await serviceClient()
    .from("review_queue")
    .select("id, proposed, reason, created_at, table_name")
    .eq("status", "pending")
    .order("created_at")
    .order("id")
  const { data: reviewed } = await serviceClient().from("review_queue").select("field_changes").eq("status", "approved")
  const stats = fieldChangeStats(reviewed ?? [])
  const ready = (data ?? []).filter(isReady).length
  return (
    <>
      <PageHeader
        title="Review queue"
        description="Extracted records waiting for a data editor. Nothing reaches students until it is approved here."
      />
      <ApproveAllReady ready={ready} />
      <Card data-testid="field-change-stats" className="gap-2">
        <h2 className="font-heading text-base font-bold">How often reviewers change each field</h2>
        <p className="text-xs text-muted-foreground">Across {reviewed?.length ?? 0} approved records.</p>
        <DataTable
          label="Field changes"
          columns={STATS}
          rows={stats}
          rowKey={(st) => st.field}
          path="/admin/review"
          params={params}
          minWidth="24rem"
          empty="No changes recorded yet."
        />
      </Card>
      {!data?.length ? (
        <EmptyState title="Nothing is waiting for review" />
      ) : (
        GROUPS.map(({ tables, heading, note }) => {
          const items = data.filter((i) => tables.includes(i.table_name))
          if (!items.length) return null
          return (
            <section key={heading} className="flex flex-col gap-2">
              <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
                {heading} <StatusBadge tone="warning">{items.length} pending</StatusBadge>
              </h2>
              <p className="text-xs text-muted-foreground">{note}</p>
              <ul className="flex flex-col gap-2">
                {items.map((item) => {
                  const proposed = item.proposed as Proposed
                  return (
                    <li key={item.id}>
                      <Card data-testid="review-row" className="gap-1">
                        <h3 className="font-heading text-base font-bold">
                          <Link href={`/admin/review/${item.id}`} className="underline">
                            {proposed.programme?.title ??
                              proposed.plan_name ??
                              (proposed.city ? `Costs in ${proposed.city}` : "Untitled record")}
                          </Link>
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {proposed.university?.name ?? "Unknown university"}
                        </p>
                        <p className="text-xs text-muted-foreground">{item.reason}</p>
                      </Card>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })
      )}
    </>
  )
}
