import Link from "next/link"
import { connection } from "next/server"

import { Card } from "@/components/ui/card"
import { serviceClient } from "@/lib/db/service"

export default async function Page() {
  await connection()
  const db = serviceClient()
  const count = (table: "review_queue" | "error_report", status: string) =>
    db.from(table).select("id", { count: "exact", head: true }).eq("status", status)
  const [pending, open] = await Promise.all([count("review_queue", "pending"), count("error_report", "open")])
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Card className="gap-1">
        <h1 className="font-heading text-lg font-bold">
          <Link href="/admin/review">Review queue</Link>
        </h1>
        <p data-testid="pending-count" className="text-sm text-muted-foreground">
          {pending.count ?? 0} waiting
        </p>
      </Card>
      <Card className="gap-1">
        <h2 className="font-heading text-lg font-bold">
          <Link href="/admin/reports">Error reports</Link>
        </h2>
        <p className="text-sm text-muted-foreground">{open.count ?? 0} open</p>
      </Card>
    </div>
  )
}
