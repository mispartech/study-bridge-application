import Link from "next/link"
import { connection } from "next/server"

import { DataTable, type Column } from "@/components/admin/data-table"
import { FilterBar, type FilterChip } from "@/components/admin/filter-bar"
import { KpiGrid, KpiTile } from "@/components/admin/kpi-tile"
import { PageHeader } from "@/components/admin/page-header"
import { ErrorState } from "@/components/admin/states"
import { StatusBadge } from "@/components/admin/status-badge"
import { tableHref, type SearchParams } from "@/lib/admin/table"
import { filterUsers, formatUsd, summariseUsers, type UserSummary } from "@/lib/admin/users"
import { ROLE_LABEL } from "@/lib/auth/roles"
import { serviceClient } from "@/lib/db/service"
import { getSettings } from "@/lib/settings"
import { requireStaff } from "@/lib/auth/staff-page"

const DAYS = 30
const nf = new Intl.NumberFormat("en-GB")
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "never")
/** ISO time `days` ago. Read per request, after connection(). */
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

const input = "min-h-11 rounded-button border border-border bg-surface px-3 text-sm"

const COLUMNS: Column<UserSummary>[] = [
  {
    key: "email",
    header: "Email",
    sort: (r) => r.email ?? r.id,
    cell: (r) => (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Link href={`/admin/users/${r.id}`} className="break-all underline underline-offset-4">
          {r.email ?? r.id}
        </Link>
        {r.role !== "student" && <StatusBadge tone="info">{ROLE_LABEL[r.role]}</StatusBadge>}
        {r.suspended && <StatusBadge tone="danger">suspended</StatusBadge>}
        {r.internal && (
          <StatusBadge data-testid="internal-badge" tone="neutral">
            internal
          </StatusBadge>
        )}
      </span>
    ),
  },
  { key: "created", header: "Signed up", nowrap: true, sort: (r) => r.created_at, cell: (r) => day(r.created_at) },
  {
    key: "last",
    header: "Last sign-in",
    nowrap: true,
    sort: (r) => r.last_sign_in_at,
    cell: (r) => day(r.last_sign_in_at),
  },
  { key: "plan", header: "Plan", sort: (r) => r.plan, cell: (r) => r.plan },
  { key: "searches", header: "Searches", align: "right", sort: (r) => r.searches, cell: (r) => nf.format(r.searches) },
  {
    key: "ai",
    header: "AI calls",
    align: "right",
    sort: (r) => r.ai_calls,
    cell: (r) => (
      <>
        {nf.format(r.ai_calls)}
        {r.ai_failures > 0 && <span className="text-danger-strong"> ({r.ai_failures} failed)</span>}
      </>
    ),
  },
  {
    key: "tokens",
    header: "Tokens",
    align: "right",
    sort: (r) => r.input_tokens + r.output_tokens,
    cell: (r) => nf.format(r.input_tokens + r.output_tokens),
  },
  {
    key: "cost",
    header: "AI cost",
    align: "right",
    sort: (r) => r.cost_usd,
    cell: (r) => (r.ai_calls ? formatUsd(r.cost_usd) : "—"),
  },
]

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection()
  const params = await searchParams
  const filter = { q: one(params.q), role: one(params.role), plan: one(params.plan), status: one(params.status) }
  await requireStaff("users.read")
  const db = serviceClient()
  const since = daysAgo(DAYS)
  const [{ data: auth, error }, usage, searches, plans, settings] = await Promise.all([
    db.auth.admin.listUsers({ perPage: 1000 }),
    db
      .from("ai_usage")
      .select("user_id, provider, model, input_tokens, output_tokens, success")
      .gte("created_at", since)
      .not("user_id", "is", null),
    db.from("search_log").select("user_id").gte("created_at", since).not("user_id", "is", null),
    db.from("subscription").select("user_id, plan, current_period_end"),
    getSettings(),
  ])
  if (error) return <ErrorState title="Could not load users" message={error.message} />
  const all = summariseUsers(
    auth.users,
    usage.data ?? [],
    searches.data ?? [],
    plans.data ?? [],
    settings.model_prices,
    new Date(daysAgo(0))
  )
  const rows = filterUsers(all, filter)
  const weekAgo = daysAgo(7)
  const signedUpThisWeek = all.filter((r) => r.created_at >= weekAgo).length
  const activeThisWeek = all.filter((r) => (r.last_sign_in_at ?? "") >= weekAgo).length
  const chips: FilterChip[] = (
    [
      ["q", filter.q && `“${filter.q}”`],
      ["role", filter.role && ROLE_LABEL[filter.role as keyof typeof ROLE_LABEL]],
      ["plan", filter.plan],
      ["status", filter.status],
    ] as const
  ).flatMap(([key, label]) =>
    label ? [{ label, removeHref: tableHref("/admin/users", params, { [key]: null, page: null }) }] : []
  )

  return (
    <>
      <PageHeader
        title="Users"
        description={`Accounts and their activity. Searches and AI use cover the last ${DAYS} days.`}
      />
      <KpiGrid>
        <KpiTile label="Accounts" value={nf.format(all.length)} />
        <KpiTile label="Signed up in 7 days" value={nf.format(signedUpThisWeek)} />
        <KpiTile label="Signed in within 7 days" value={nf.format(activeThisWeek)} />
        <KpiTile label="On Plus" value={nf.format(all.filter((r) => r.plan === "plus").length)} />
      </KpiGrid>
      <FilterBar chips={chips} resetHref="/admin/users">
        <form method="get" className="flex flex-wrap items-end gap-2 text-sm" aria-label="Find users">
          <label className="flex flex-col gap-1">
            Email or id
            <input name="q" defaultValue={filter.q} className={input} />
          </label>
          <label className="flex flex-col gap-1">
            Role
            <select name="role" defaultValue={filter.role ?? ""} className={input}>
              <option value="">Any</option>
              {(Object.keys(ROLE_LABEL) as (keyof typeof ROLE_LABEL)[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Plan
            <select name="plan" defaultValue={filter.plan ?? ""} className={input}>
              <option value="">Any</option>
              <option value="free">Free</option>
              <option value="plus">Plus</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Status
            <select name="status" defaultValue={filter.status ?? ""} className={input}>
              <option value="">Any</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </label>
          <button type="submit" className={`${input} font-medium`}>
            Search
          </button>
        </form>
      </FilterBar>
      <p className="text-xs text-muted-foreground">
        {rows.length} of {all.length} accounts.
      </p>
      <DataTable
        label="Users"
        columns={COLUMNS}
        rows={rows}
        rowKey={(r) => r.id}
        rowProps={() => ({ "data-testid": "user-row" })}
        path="/admin/users"
        params={params}
        defaultSort="created"
        minWidth="48rem"
        empty="No accounts match."
      />
    </>
  )
}
