import Link from "next/link"

import { DataTable, type Column } from "@/components/admin/data-table"
import { KpiGrid, KpiTile } from "@/components/admin/kpi-tile"
import { PageHeader } from "@/components/admin/page-header"
import { StatusBadge, toneFor } from "@/components/admin/status-badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { SearchParams } from "@/lib/admin/table"
import { serviceClient } from "@/lib/db/service"

const nf = new Intl.NumberFormat("en-GB")
const DAY_MS = 86_400_000
const time = (iso: string | null | undefined) => (iso ? iso.slice(0, 16).replace("T", " ") : "—")
const RECENT = 10

type Account = { id: string; email: string; created_at: string; banned_until: string | null }
type Problem = { id: string; email: string; created_at: string; delivery_status: string }

const userLink = (a: Account) => (
  <Link href={`/admin/users/${a.id}`} className="break-all underline underline-offset-4">
    {a.email}
  </Link>
)

const SIGNUPS: Column<Account>[] = [
  { key: "email", header: "Email", cell: userLink },
  { key: "created", header: "Signed up", cell: (a) => time(a.created_at), nowrap: true, fixed: true },
]

const SUSPENDED: Column<Account>[] = [
  { key: "email", header: "Email", cell: userLink },
  { key: "until", header: "Suspended until", cell: (a) => time(a.banned_until), nowrap: true, fixed: true },
]

const PROBLEMS: Column<Problem>[] = [
  { key: "email", header: "Email", cell: (r) => <span className="break-all">{r.email}</span> },
  { key: "sent", header: "Sent", cell: (r) => time(r.created_at), nowrap: true, fixed: true },
  {
    key: "status",
    header: "Delivery",
    cell: (r) => <StatusBadge tone={toneFor(r.delivery_status)}>{r.delivery_status}</StatusBadge>,
    fixed: true,
  },
]

/** The support home: find a user, new sign-ups, report emails that didn't arrive, and suspended accounts. */
export async function SupportHome({ params, now }: { params: SearchParams; now: Date }) {
  const db = serviceClient()
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS).toISOString()
  const monthAgo = new Date(now.getTime() - 30 * DAY_MS).toISOString()
  const [{ data: auth }, problems] = await Promise.all([
    db.auth.admin.listUsers({ perPage: 1000 }),
    db
      .from("report")
      .select("id, email, created_at, delivery_status")
      .neq("delivery_status", "sent")
      .gte("created_at", monthAgo)
      .order("created_at", { ascending: false })
      .limit(50),
  ])
  const accounts: Account[] = (auth?.users ?? []).map((u) => ({
    id: u.id,
    email: u.email ?? u.id,
    created_at: u.created_at,
    banned_until: u.banned_until ?? null,
  }))
  const signups = accounts
    .filter((a) => a.created_at >= weekAgo)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  const suspended = accounts.filter((a) => a.banned_until && Date.parse(a.banned_until) > now.getTime())

  return (
    <>
      <PageHeader title="Support desk" description="Find a student, and see who may need help." />
      <Card className="gap-2">
        <form
          method="get"
          action="/admin/users"
          className="flex flex-wrap items-end gap-2 text-sm"
          aria-label="Find a user"
        >
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            Email or id
            <input name="q" className="min-h-11 rounded-button border border-border bg-surface px-3" />
          </label>
          <Button type="submit">Find</Button>
        </form>
      </Card>
      <KpiGrid columns={3}>
        <KpiTile label="Signed up in 7 days" value={nf.format(signups.length)} testId="home-signups" />
        <KpiTile
          label="Report emails not delivered"
          value={nf.format(problems.data?.length ?? 0)}
          detail="Last 30 days: failed or still queued"
          testId="home-delivery-problems"
        />
        <KpiTile label="Suspended accounts" value={nf.format(suspended.length)} testId="home-suspended" />
      </KpiGrid>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="gap-2">
          <h2 className="font-heading text-base font-bold">Recent sign-ups</h2>
          <DataTable
            label="Recent sign-ups"
            columns={SIGNUPS}
            rows={signups.slice(0, RECENT)}
            rowKey={(a) => a.id}
            path="/admin"
            params={params}
            prefix="s."
            minWidth="20rem"
            empty="No sign-ups in the last 7 days."
          />
        </Card>
        <Card className="gap-2">
          <h2 className="font-heading text-base font-bold">Report emails with problems</h2>
          <DataTable
            label="Report emails with problems"
            columns={PROBLEMS}
            rows={problems.data ?? []}
            rowKey={(r) => r.id}
            path="/admin"
            params={params}
            prefix="p."
            minWidth="24rem"
            empty="Every report in the last 30 days was delivered."
          />
          <Link href="/admin/emailed-reports" className="text-sm underline underline-offset-4">
            All emailed reports
          </Link>
        </Card>
      </div>
      <Card className="gap-2">
        <h2 className="font-heading text-base font-bold">Suspended accounts</h2>
        <DataTable
          label="Suspended accounts"
          columns={SUSPENDED}
          rows={suspended}
          rowKey={(a) => a.id}
          path="/admin"
          params={params}
          prefix="x."
          minWidth="20rem"
          empty="No accounts are suspended."
        />
      </Card>
    </>
  )
}
