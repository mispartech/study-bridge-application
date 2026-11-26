import Link from "next/link"
import { connection } from "next/server"

import { PageHeader } from "@/components/admin/page-header"
import { ReportActions } from "@/components/admin/report-actions"
import { EmptyState } from "@/components/admin/states"
import { Card } from "@/components/ui/card"
import { serviceClient } from "@/lib/db/service"
import { requireStaff } from "@/lib/auth/staff-page"

const time = (iso: string) => iso.slice(0, 16).replace("T", " ")

export default async function Page() {
  await connection()
  await requireStaff("content")
  const { data } = await serviceClient()
    .from("error_report")
    .select("id, message, created_at, programme_id, programme(title)")
    .eq("status", "open")
    .order("created_at", { ascending: false })
  return (
    <>
      <PageHeader title="Error reports" description="Data problems reported by students, newest first." />
      {!data?.length ? (
        <EmptyState title="No open error reports" />
      ) : (
        <ul className="flex flex-col gap-2">
          {data.map((report) => (
            <li key={report.id}>
              <Card data-testid="error-report" className="gap-2">
                <h2 className="font-heading text-base font-bold">
                  <Link href={`/programmes/${report.programme_id}`} className="underline">
                    {report.programme?.title ?? "Programme"}
                  </Link>
                </h2>
                <p className="text-xs text-muted-foreground tabular-nums">{time(report.created_at)} UTC</p>
                <p className="text-sm whitespace-pre-wrap">{report.message}</p>
                <ReportActions id={report.id} />
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
