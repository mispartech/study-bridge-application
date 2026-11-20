import { connection } from "next/server"

import { RangeFilter } from "@/components/admin/range-filter"
import { ReportRowActions } from "@/components/admin/report-row-actions"
import { Card } from "@/components/ui/card"
import { parseRange } from "@/lib/admin/range"
import { can } from "@/lib/auth/roles"
import { requireStaff } from "@/lib/auth/staff-page"
import { serviceClient } from "@/lib/db/service"

const LIMIT = 200
const time = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") : "—")
const pct = (n: number, d: number) => (d === 0 ? "—" : `${Math.round((n / d) * 100)}%`)

/** Reports emailed to one-time visitors: delivery, consents, and how many became accounts. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>
}) {
  await connection()
  const { user } = await requireStaff("users.read")
  const range = parseRange(await searchParams, new Date())
  const { data, error } = await serviceClient()
    .from("report")
    .select("id, email, created_at, delivery_status, claimed_at, reminders_consent, marketing_consent")
    .gte("created_at", range.from.toISOString())
    .lt("created_at", range.to.toISOString())
    .order("created_at", { ascending: false })
    .limit(LIMIT)
  const rows = data ?? []
  const claimed = rows.filter((r) => r.claimed_at).length
  const failed = rows.filter((r) => r.delivery_status === "failed").length
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-xl font-bold">Emailed reports</h1>
      <RangeFilter
        path="/admin/emailed-reports"
        range={range}
        exportHref={`/api/admin/export?dataset=reports&${range.query}`}
      />
      <section className="grid gap-3 sm:grid-cols-3">
        {[
          ["Reports sent", String(rows.length)],
          ["Opened as accounts", `${claimed} (${pct(claimed, rows.length)})`],
          ["Failed to send", String(failed)],
        ].map(([label, value]) => (
          <Card key={label} className="gap-1">
            <h2 className="text-sm text-muted-foreground">{label}</h2>
            <p data-testid="report-metric" className="font-heading text-2xl font-extrabold tabular-nums">
              {value}
            </p>
          </Card>
        ))}
      </section>
      {error && <p className="text-danger-strong">Could not load reports: {error.message}</p>}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reports in this range.</p>
      ) : (
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Emailed reports">
          <table className="w-full min-w-[56rem] text-left text-sm tabular-nums">
            <thead className="text-muted-foreground">
              <tr>
                {["Sent", "Email", "Delivery", "Opened as account", "Reminders", "Updates", ""].map((h) => (
                  <th key={h} scope="col" className="py-2 pr-4 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} data-testid="report-row" className="border-t border-border align-top">
                  <td className="py-2 pr-4 whitespace-nowrap">{time(r.created_at)}</td>
                  <td className="py-2 pr-4 break-all">{r.email}</td>
                  <td className="py-2 pr-4">{r.delivery_status}</td>
                  <td className="py-2 pr-4">{time(r.claimed_at)}</td>
                  <td className="py-2 pr-4">{r.reminders_consent ? "yes" : "no"}</td>
                  <td className="py-2 pr-4">{r.marketing_consent ? "yes" : "no"}</td>
                  <td className="py-2">
                    <ReportRowActions
                      id={r.id}
                      canManage={can(user, "users.manage")}
                      canErase={can(user, "users.erase")}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
