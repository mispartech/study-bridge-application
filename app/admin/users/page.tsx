import Link from "next/link"
import { connection } from "next/server"

import { Card } from "@/components/ui/card"
import { filterUsers, formatUsd, summariseUsers } from "@/lib/admin/users"
import { ROLE_LABEL } from "@/lib/auth/roles"
import { serviceClient } from "@/lib/db/service"
import { getSettings } from "@/lib/settings"
import { requireStaff } from "@/lib/auth/staff-page"

const DAYS = 30
const nf = new Intl.NumberFormat("en-GB")
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : "never")
/** ISO time `days` ago. Read per request, after connection(). */
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()

const input = "min-h-11 rounded-button border border-border bg-surface px-3 text-sm"

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; plan?: string; status?: string }>
}) {
  await connection()
  const filter = await searchParams
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
  if (error) return <p className="text-danger-strong">Could not load users: {error.message}</p>
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
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-xl font-bold">Users</h1>
      <section className="grid gap-3 sm:grid-cols-4">
        {[
          ["Accounts", all.length],
          ["Signed up in 7 days", signedUpThisWeek],
          ["Signed in within 7 days", activeThisWeek],
          ["On Plus", all.filter((r) => r.plan === "plus").length],
        ].map(([label, value]) => (
          <Card key={label} className="gap-1">
            <h2 className="text-sm text-muted-foreground">{label}</h2>
            <p className="font-heading text-2xl font-extrabold tabular-nums">{nf.format(Number(value))}</p>
          </Card>
        ))}
      </section>
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
      <p className="text-xs text-muted-foreground">
        {rows.length} of {all.length} accounts. Searches and AI use cover the last {DAYS} days.
      </p>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Users">
        <table className="w-full min-w-[48rem] text-left text-sm tabular-nums">
          <thead className="text-muted-foreground">
            <tr>
              {["Email", "Signed up", "Last sign-in", "Plan", "Searches", "AI calls", "Tokens", "AI cost"].map((h) => (
                <th key={h} scope="col" className="py-2 pr-4 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-testid="user-row" className="border-t border-border">
                <td className="py-2 pr-4">
                  <Link href={`/admin/users/${r.id}`} className="underline underline-offset-4">
                    {r.email ?? r.id}
                  </Link>
                  {r.role !== "student" && (
                    <span className="ml-2 text-xs font-semibold text-primary">{ROLE_LABEL[r.role]}</span>
                  )}
                  {r.suspended && <span className="ml-2 text-xs font-semibold text-danger-strong">suspended</span>}
                  {r.internal && (
                    <span data-testid="internal-badge" className="ml-2 text-xs font-semibold text-muted-foreground">
                      internal
                    </span>
                  )}
                </td>
                <td className="py-2 pr-4 whitespace-nowrap">{day(r.created_at)}</td>
                <td className="py-2 pr-4 whitespace-nowrap">{day(r.last_sign_in_at)}</td>
                <td className="py-2 pr-4">{r.plan}</td>
                <td className="py-2 pr-4">{nf.format(r.searches)}</td>
                <td className="py-2 pr-4">
                  {nf.format(r.ai_calls)}
                  {r.ai_failures > 0 && <span className="text-danger-strong"> ({r.ai_failures} failed)</span>}
                </td>
                <td className="py-2 pr-4">{nf.format(r.input_tokens + r.output_tokens)}</td>
                <td className="py-2 pr-4">{r.ai_calls ? formatUsd(r.cost_usd) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
