import Link from "next/link"
import { connection } from "next/server"

import { DataTable, type Column } from "@/components/admin/data-table"
import { DetailDrawer } from "@/components/admin/detail-drawer"
import { FilterBar, type FilterChip } from "@/components/admin/filter-bar"
import { PageHeader } from "@/components/admin/page-header"
import { ErrorState } from "@/components/admin/states"
import { tableHref, type SearchParams } from "@/lib/admin/table"
import { requireStaff } from "@/lib/auth/staff-page"
import { serviceClient } from "@/lib/db/service"
import type { Tables } from "@/lib/db/database.types"

const LIMIT = 200
const input = "min-h-11 rounded-button border border-border bg-surface px-3 text-sm"
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)
const time = (iso: string) => iso.slice(0, 16).replace("T", " ")

const ACTIONS = [
  "user_viewed",
  "role_changed",
  "role_change_detected",
  "record_approved",
  "record_rejected",
  "visa_rule_changed",
  "setting_changed",
  "market_rate_entered",
  "estimate_entered",
  "error_report_updated",
  "export_downloaded",
  "user_suspended",
  "user_unsuspended",
  "user_deleted",
  "link_resent",
  "report_resent",
  "report_deleted",
  "email_blocked",
  "refund_issued",
  "system_cleanup_role_removed",
  "system_cleanup_account_deleted",
] as const

type Entry = Tables<"staff_audit">

/** Every staff action, newest first. Read-only: the table itself refuses edits and deletes. */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection()
  await requireStaff("audit")
  const params = await searchParams
  const staff = one(params.staff) ?? ""
  const action = one(params.action) ?? ""
  const from = one(params.from) ?? ""
  const to = one(params.to) ?? ""
  const open = one(params.entry)
  let query = serviceClient().from("staff_audit").select("*").order("occurred_at", { ascending: false }).limit(LIMIT)
  if (staff) query = query.ilike("staff_email", `%${staff.replace(/[%_]/g, "")}%`)
  if (action) query = query.eq("action", action)
  if (/^\d{4}-\d{2}-\d{2}$/.test(from)) query = query.gte("occurred_at", `${from}T00:00:00Z`)
  if (/^\d{4}-\d{2}-\d{2}$/.test(to)) query = query.lte("occurred_at", `${to}T23:59:59Z`)
  const { data, error } = await query
  const rows = data ?? []
  const opened = open ? rows.find((e) => String(e.id) === open) : undefined

  const columns: Column<Entry>[] = [
    { key: "when", header: "When (UTC)", nowrap: true, sort: (e) => e.occurred_at, cell: (e) => time(e.occurred_at) },
    {
      key: "action",
      header: "Action",
      sort: (e) => e.action,
      cell: (e) => <strong>{e.action.replace(/_/g, " ")}</strong>,
    },
    {
      key: "target",
      header: "Target",
      cell: (e) =>
        e.target_type ? (
          <span className="text-muted-foreground">
            {e.target_type}
            {e.target_id ? ` ${e.target_id.slice(0, 8)}` : ""}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "staff",
      header: "Staff",
      sort: (e) => e.staff_email ?? e.staff_id,
      cell: (e) => <span className="break-all">{e.staff_email ?? e.staff_id}</span>,
    },
    { key: "reason", header: "Reason", cell: (e) => e.reason ?? "" },
    {
      key: "changes",
      header: "Changes",
      fixed: true,
      cell: (e) =>
        e.before !== null || e.after !== null ? (
          <Link
            href={tableHref("/admin/audit", params, { entry: String(e.id) })}
            scroll={false}
            className="underline underline-offset-4"
          >
            What changed
          </Link>
        ) : null,
    },
  ]

  const chips: FilterChip[] = (
    [
      ["staff", staff && `Staff “${staff}”`],
      ["action", action && action.replace(/_/g, " ")],
      ["from", from && `From ${from}`],
      ["to", to && `To ${to}`],
    ] as const
  ).flatMap(([key, label]) =>
    label ? [{ label, removeHref: tableHref("/admin/audit", params, { [key]: null, page: null }) }] : []
  )

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every staff action, with what changed. Entries can't be edited or deleted, by anyone."
      />
      <FilterBar chips={chips} resetHref="/admin/audit">
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
      </FilterBar>
      {error && <ErrorState title="Could not load the audit log" message={error.message} />}
      <DataTable
        label="Audit log"
        columns={columns}
        rows={rows}
        rowKey={(e) => String(e.id)}
        rowProps={() => ({ "data-testid": "audit-entry" })}
        path="/admin/audit"
        params={params}
        defaultSort="when"
        minWidth="52rem"
        exportHref="/api/admin/export?dataset=audit&range=90d"
        empty="No entries match."
      />
      {opened && (
        <DetailDrawer
          title={opened.action.replace(/_/g, " ")}
          closeHref={tableHref("/admin/audit", params, { entry: null })}
        >
          <dl className="mb-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">When</dt>
            <dd>{time(opened.occurred_at)} UTC</dd>
            <dt className="text-muted-foreground">Staff</dt>
            <dd className="break-all">{opened.staff_email ?? opened.staff_id}</dd>
            <dt className="text-muted-foreground">Target</dt>
            <dd className="break-all">
              {opened.target_type ?? "—"} {opened.target_id ?? ""}
            </dd>
            {opened.reason && (
              <>
                <dt className="text-muted-foreground">Reason</dt>
                <dd>{opened.reason}</dd>
              </>
            )}
          </dl>
          <pre data-testid="audit-changes" className="overflow-x-auto rounded-button bg-surface-subtle p-3 text-xs">
            {JSON.stringify({ before: opened.before, after: opened.after }, null, 2)}
          </pre>
        </DetailDrawer>
      )}
    </>
  )
}
