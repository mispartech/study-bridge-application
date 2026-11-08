import Link from "next/link"
import { connection } from "next/server"

import { Card } from "@/components/ui/card"
import { fieldChangeStats } from "@/lib/admin/field-changes"
import { serviceClient } from "@/lib/db/service"

type Proposed = {
  university?: { name?: string } | null
  programme?: { title?: string } | null
  city?: string
  plan_name?: string
}

export default async function Page() {
  await connection()
  const { data } = await serviceClient()
    .from("review_queue")
    .select("id, proposed, reason, created_at")
    .eq("status", "pending")
    .order("created_at")
  const { data: reviewed } = await serviceClient().from("review_queue").select("field_changes").eq("status", "approved")
  const stats = fieldChangeStats(reviewed ?? [])
  return (
    <div className="flex flex-col gap-4">
      <Card data-testid="field-change-stats" className="gap-2">
        <h2 className="font-heading text-base font-bold">How often reviewers change each field</h2>
        <p className="text-xs text-muted-foreground">Across {reviewed?.length ?? 0} approved records.</p>
        {stats.length === 0 ? (
          <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <tbody>
              {stats.map((s) => (
                <tr key={s.field}>
                  <td className="font-mono text-xs">{s.field}</td>
                  <td className="text-right tabular-nums">
                    {s.changed} ({Math.round(s.rate * 100)}%)
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {!data?.length ? (
        <p className="text-sm text-muted-foreground">Nothing is waiting for review.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.map((item) => {
            const proposed = item.proposed as Proposed
            return (
              <li key={item.id}>
                <Card data-testid="review-row" className="gap-1">
                  <h1 className="font-heading text-base font-bold">
                    <Link href={`/admin/review/${item.id}`} className="underline">
                      {proposed.programme?.title ??
                        proposed.plan_name ??
                        (proposed.city ? `Costs in ${proposed.city}` : "Untitled record")}
                    </Link>
                  </h1>
                  <p className="text-sm text-muted-foreground">{proposed.university?.name ?? "Unknown university"}</p>
                  <p className="text-xs text-muted-foreground">{item.reason}</p>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
