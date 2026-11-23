import { connection } from "next/server"

import { DataTable, type Column } from "@/components/admin/data-table"
import { FilterBar } from "@/components/admin/filter-bar"
import { PageHeader } from "@/components/admin/page-header"
import { RangeFilter } from "@/components/admin/range-filter"
import { Card } from "@/components/ui/card"
import { DISMISS_LABEL, DISMISS_REASONS, THUMBS_LABEL } from "@/lib/activity/events"
import { parseRange } from "@/lib/admin/range"
import type { SearchParams } from "@/lib/admin/table"
import { requireStaff } from "@/lib/auth/staff-page"
import { serviceClient } from "@/lib/db/service"

const nf = new Intl.NumberFormat("en-GB")
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
const dismissedTotal = (r: { dismissed: Record<string, number> }) =>
  Object.values(r.dismissed).reduce((x, y) => x + y, 0)

type Row = {
  id: string
  title: string
  saves: number
  applies: number
  helpful: number
  unhelpful: number
  dismissed: Record<string, number>
}

/** How students act on each suggestion, and what they say about explanations and advisor answers. */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection()
  await requireStaff("overview")
  const params = await searchParams
  const range = parseRange({ range: one(params.range), from: one(params.from), to: one(params.to) }, new Date())
  const db = serviceClient()
  const args = { p_from: range.from.toISOString(), p_to: range.to.toISOString() }
  const [byTarget, advisor] = await Promise.all([
    db.rpc("activity_by_target", {
      ...args,
      p_events: ["programme_saved", "programme_dismissed", "apply_clicked", "suggestion_feedback"],
    }),
    db
      .from("activity_event")
      .select("properties")
      .eq("event", "advisor_thumbs")
      .gte("occurred_at", args.p_from)
      .lt("occurred_at", args.p_to)
      .limit(5000),
  ])

  const rows = new Map<string, Row>()
  for (const r of byTarget.data ?? []) {
    const row = rows.get(r.target_id) ?? {
      id: r.target_id,
      title: "",
      saves: 0,
      applies: 0,
      helpful: 0,
      unhelpful: 0,
      dismissed: {},
    }
    const n = Number(r.events)
    if (r.event === "programme_saved") row.saves += n
    if (r.event === "apply_clicked") row.applies += n
    if (r.event === "programme_dismissed" && r.reason) row.dismissed[r.reason] = (row.dismissed[r.reason] ?? 0) + n
    // A thumbs-down always carries a reason; a thumbs-up never does.
    if (r.event === "suggestion_feedback") {
      if (r.reason) row.unhelpful += n
      else row.helpful += n
    }
    rows.set(r.target_id, row)
  }
  const ids = [...rows.keys()]
  const { data: programmes } = ids.length
    ? await db.from("programme").select("id, title").in("id", ids)
    : { data: [] as { id: string; title: string }[] }
  for (const p of programmes ?? []) rows.get(p.id)!.title = p.title
  const table = [...rows.values()].sort(
    (a, b) => b.saves + b.applies + dismissedTotal(b) - (a.saves + a.applies + dismissedTotal(a))
  )
  const columns: Column<Row>[] = [
    { key: "programme", header: "Programme", sort: (r) => r.title, cell: (r) => r.title || "Removed programme" },
    { key: "saves", header: "Saves", align: "right", sort: (r) => r.saves, cell: (r) => nf.format(r.saves) },
    {
      key: "applies",
      header: "Apply clicks",
      align: "right",
      sort: (r) => r.applies,
      cell: (r) => nf.format(r.applies),
    },
    {
      key: "helpful",
      header: "Explanation 👍",
      align: "right",
      sort: (r) => r.helpful,
      cell: (r) => nf.format(r.helpful),
    },
    {
      key: "unhelpful",
      header: "Explanation 👎",
      align: "right",
      sort: (r) => r.unhelpful,
      cell: (r) => nf.format(r.unhelpful),
    },
    ...DISMISS_REASONS.map((reason): Column<Row> => ({
      key: `dismissed-${reason}`,
      header: `Not for me: ${DISMISS_LABEL[reason]}`,
      align: "right",
      sort: (r) => r.dismissed[reason] ?? 0,
      cell: (r) => nf.format(r.dismissed[reason] ?? 0),
    })),
  ]

  const votes = (advisor.data ?? []).map((e) => e.properties as { up?: boolean; reason?: string })
  const up = votes.filter((v) => v.up).length
  const downReasons = new Map<string, number>()
  for (const v of votes.filter((v) => !v.up && v.reason)) {
    downReasons.set(v.reason!, (downReasons.get(v.reason!) ?? 0) + 1)
  }

  return (
    <>
      <PageHeader
        title="Suggestions and feedback"
        description="How students act on each suggestion, and what they say about explanations and advisor answers."
      />
      <FilterBar>
        <RangeFilter
          path="/admin/feedback"
          range={range}
          exportHref={`/api/admin/export?dataset=feedback&${range.query}`}
        />
      </FilterBar>

      <Card className="gap-2">
        <h2 className="font-heading text-base font-bold">Advisor answers</h2>
        <p data-testid="advisor-votes" className="text-sm">
          {nf.format(up)} helpful · {nf.format(votes.length - up)} not helpful
        </p>
        {downReasons.size > 0 && (
          <p className="text-xs text-muted-foreground">
            Why not:{" "}
            {[...downReasons]
              .sort((a, b) => b[1] - a[1])
              .map(([k, v]) => `${THUMBS_LABEL[k as keyof typeof THUMBS_LABEL] ?? k} ${v}`)
              .join(" · ")}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Answer text is never stored, so feedback can&apos;t be traced back to the conversation.
        </p>
      </Card>

      <DataTable
        label="Feedback per programme"
        columns={columns}
        rows={table}
        rowKey={(r) => r.id}
        rowProps={() => ({ "data-testid": "feedback-row" })}
        path="/admin/feedback"
        params={params}
        minWidth="60rem"
        empty="No feedback on programmes in this range."
      />
      <p className="text-xs text-muted-foreground">
        How often each programme is shown isn&apos;t recorded yet, so these are counts rather than rates.
      </p>
    </>
  )
}
