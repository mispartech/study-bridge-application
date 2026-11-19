import Link from "next/link"
import { connection } from "next/server"

import { Card } from "@/components/ui/card"
import { can } from "@/lib/auth/roles"
import { requireStaff } from "@/lib/auth/staff-page"
import { serviceClient } from "@/lib/db/service"

export default async function Page({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  await connection()
  const { user } = await requireStaff()
  const { denied } = await searchParams
  const db = serviceClient()
  const count = (table: "review_queue" | "error_report", status: string) =>
    db.from(table).select("id", { count: "exact", head: true }).eq("status", status)
  const content = can(user, "content")
  const [pending, open] = content
    ? await Promise.all([count("review_queue", "pending"), count("error_report", "open")])
    : [null, null]
  return (
    <div className="flex flex-col gap-3">
      {denied && (
        <p role="alert" className="rounded-button bg-warning-tint p-3 text-sm text-warning-strong">
          Your role doesn&apos;t include that page. Ask an admin if you need it.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {content && (
          <>
            <Card className="gap-1">
              <h1 className="font-heading text-lg font-bold">
                <Link href="/admin/review">Review queue</Link>
              </h1>
              <p data-testid="pending-count" className="text-sm text-muted-foreground">
                {pending?.count ?? 0} waiting
              </p>
            </Card>
            <Card className="gap-1">
              <h2 className="font-heading text-lg font-bold">
                <Link href="/admin/reports">Error reports</Link>
              </h2>
              <p className="text-sm text-muted-foreground">{open?.count ?? 0} open</p>
            </Card>
          </>
        )}
        {can(user, "users.read") && (
          <Card className="gap-1">
            <h2 className="font-heading text-lg font-bold">
              <Link href="/admin/users">Users</Link>
            </h2>
            <p className="text-sm text-muted-foreground">Accounts, activity and AI use</p>
          </Card>
        )}
      </div>
    </div>
  )
}
