import { connection } from "next/server"

import { RangeFilter } from "@/components/admin/range-filter"
import { Card } from "@/components/ui/card"
import { DISMISS_LABEL, DISMISS_REASONS, THUMBS_LABEL } from "@/lib/activity/events"
import { parseRange } from "@/lib/admin/range"
import { requireStaff } from "@/lib/auth/staff-page"
import { serviceClient } from "@/lib/db/service"

const nf = new Intl.NumberFormat("en-GB")

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
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>
}) {
  await connection()
  await requireStaff("overview")
  const range = parseRange(await searchParams, new Date())
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
    (a, b) =>
      b.saves +
      b.applies +
      Object.values(b.dismissed).reduce((x, y) => x + y, 0) -
      (a.saves + a.applies + Object.values(a.dismissed).reduce((x, y) => x + y, 0))
  )

  const votes = (advisor.data ?? []).map((e) => e.properties as { up?: boolean; reason?: string })
  const up = votes.filter((v) => v.up).length
  const downReasons = new Map<string, number>()
  for (const v of votes.filter((v) => !v.up && v.reason)) {
    downReasons.set(v.reason!, (downReasons.get(v.reason!) ?? 0) + 1)
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-xl font-bold">Suggestions and feedback</h1>
      <RangeFilter
        path="/admin/feedback"
        range={range}
        exportHref={`/api/admin/export?dataset=feedback&${range.query}`}
      />

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

      {table.length === 0 ? (
        <p className="text-sm text-muted-foreground">No feedback on programmes in this range.</p>
      ) : (
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Feedback per programme">
          <table className="w-full min-w-[60rem] text-left text-sm tabular-nums">
            <thead className="text-muted-foreground">
              <tr>
                {[
                  "Programme",
                  "Saves",
                  "Apply clicks",
                  "Explanation 👍",
                  "Explanation 👎",
                  ...DISMISS_REASONS.map((r) => `Not for me: ${DISMISS_LABEL[r]}`),
                ].map((h) => (
                  <th key={h} scope="col" className="py-2 pr-4 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.map((r) => (
                <tr key={r.id} data-testid="feedback-row" className="border-t border-border">
                  <td className="py-2 pr-4">{r.title || "Removed programme"}</td>
                  <td className="py-2 pr-4">{nf.format(r.saves)}</td>
                  <td className="py-2 pr-4">{nf.format(r.applies)}</td>
                  <td className="py-2 pr-4">{nf.format(r.helpful)}</td>
                  <td className="py-2 pr-4">{nf.format(r.unhelpful)}</td>
                  {DISMISS_REASONS.map((reason) => (
                    <td key={reason} className="py-2 pr-4">
                      {nf.format(r.dismissed[reason] ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        How often each programme is shown isn&apos;t recorded yet, so these are counts rather than rates.
      </p>
    </div>
  )
}
