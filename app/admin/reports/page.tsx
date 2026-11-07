import Link from "next/link"
import { connection } from "next/server"

import { ReportActions } from "@/components/admin/report-actions"
import { Card } from "@/components/ui/card"
import { serviceClient } from "@/lib/db/service"

export default async function Page() {
  await connection()
  const { data } = await serviceClient()
    .from("error_report")
    .select("id, message, created_at, programme_id, programme(title)")
    .eq("status", "open")
    .order("created_at", { ascending: false })
  if (!data?.length) return <p className="text-sm text-muted-foreground">No open error reports.</p>
  return (
    <ul className="flex flex-col gap-2">
      {data.map((report) => (
        <li key={report.id}>
          <Card data-testid="error-report" className="gap-2">
            <h1 className="font-heading text-base font-bold">
              <Link href={`/programmes/${report.programme_id}`} className="underline">
                {report.programme?.title ?? "Programme"}
              </Link>
            </h1>
            <p className="text-sm whitespace-pre-wrap">{report.message}</p>
            <ReportActions id={report.id} />
          </Card>
        </li>
      ))}
    </ul>
  )
}
