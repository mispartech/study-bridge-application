import { connection } from "next/server"

import { Card } from "@/components/ui/card"
import { requireStaff } from "@/lib/auth/staff-page"
import { serviceClient } from "@/lib/db/service"

const LIMIT = 200
const input = "min-h-11 rounded-button border border-border bg-surface px-3 text-sm"

const ACTIONS = [
  "user_viewed",
  "role_changed",
  "record_approved",
  "record_rejected",
  "visa_rule_changed",
  "setting_changed",
  "market_rate_entered",
  "estimate_entered",
  "error_report_updated",
] as const

/** Every staff action, newest first. Read-only: the table itself refuses edits and deletes. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ staff?: string; action?: string; from?: string; to?: string }>
}) {
  await connection()
  await requireStaff("audit")
  const { staff = "", action = "", from = "", to = "" } = await searchParams
  let query = serviceClient().from("staff_audit").select("*").order("occurred_at", { ascending: false }).limit(LIMIT)
  if (staff) query = query.ilike("staff_email", `%${staff.replace(/[%_]/g, "")}%`)
  if (action) query = query.eq("action", action)
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) query = query.gte("occurred_at", `${from}T00:00:00Z`)
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) query = query.lte("occurred_at", `${to}T23:59:59Z`)
  const { data, error } = await query
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-xl font-bold">Audit log</h1>
      <p className="text-sm text-muted-foreground">
        Every staff action, with what changed. Entries can&apos;t be edited or deleted, by anyone.
      </p>
      <form className="flex flex-wrap items-end gap-2 text-sm" method="get">
        <label className="flex flex-col gap-1">
          Staff email
          <input name="staff" defaultValue={staff} className={input} />
        </label>
        <label className="flex flex-col gap-1">
          Action
          <select name="action" defaultValue={action} className={input}>
            <option value="">Any</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          From
          <input type="date" name="from" defaultValue={from} className={input} />
        </label>
        <label className="flex flex-col gap-1">
          To
          <input type="date" name="to" defaultValue={to} className={input} />
        </label>
        <button type="submit" className={`${input} font-medium`}>
          Filter
        </button>
      </form>
      {error && <p className="text-danger-strong">Could not load the audit log: {error.message}</p>}
      {(data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No entries match.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {(data ?? []).map((e) => (
            <li key={e.id}>
              <Card data-testid="audit-entry" className="gap-1 text-sm">
                <p>
                  <strong>{e.action.replace(/_/g, " ")}</strong>
                  {e.target_type && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {e.target_type}
                      {e.target_id ? ` ${e.target_id.slice(0, 8)}` : ""}
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {e.occurred_at.slice(0, 16).replace("T", " ")} UTC · {e.staff_email ?? e.staff_id}
                  {e.reason ? ` · ${e.reason}` : ""}
                </p>
                {(e.before !== null || e.after !== null) && (
                  <details className="text-xs">
                    <summary className="cursor-pointer">What changed</summary>
                    <pre className="mt-1 overflow-x-auto rounded-button bg-surface-subtle p-2">
                      {JSON.stringify({ before: e.before, after: e.after }, null, 2)}
                    </pre>
                  </details>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
