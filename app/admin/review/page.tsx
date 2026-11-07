import Link from "next/link"
import { connection } from "next/server"

import { Card } from "@/components/ui/card"
import { serviceClient } from "@/lib/db/service"

type Proposed = { university?: { name?: string } | null; programme?: { title?: string } | null }

export default async function Page() {
  await connection()
  const { data } = await serviceClient()
    .from("review_queue")
    .select("id, proposed, reason, created_at")
    .eq("status", "pending")
    .order("created_at")
  if (!data?.length) return <p className="text-sm text-muted-foreground">Nothing is waiting for review.</p>
  return (
    <ul className="flex flex-col gap-2">
      {data.map((item) => {
        const proposed = item.proposed as Proposed
        return (
          <li key={item.id}>
            <Card data-testid="review-row" className="gap-1">
              <h1 className="font-heading text-base font-bold">
                <Link href={`/admin/review/${item.id}`} className="underline">
                  {proposed.programme?.title ?? "Untitled record"}
                </Link>
              </h1>
              <p className="text-sm text-muted-foreground">{proposed.university?.name ?? "Unknown university"}</p>
              <p className="text-xs text-muted-foreground">{item.reason}</p>
            </Card>
          </li>
        )
      })}
    </ul>
  )
}
