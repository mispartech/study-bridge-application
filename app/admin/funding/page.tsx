import Link from "next/link"
import { connection } from "next/server"

import { DataTable, type Column } from "@/components/admin/data-table"
import { DetailDrawer } from "@/components/admin/detail-drawer"
import { FilterBar, type FilterChip } from "@/components/admin/filter-bar"
import { FundingForm } from "@/components/admin/funding-form"
import { KpiGrid, KpiTile } from "@/components/admin/kpi-tile"
import { PageHeader } from "@/components/admin/page-header"
import { StatusBadge } from "@/components/admin/status-badge"
import { Card } from "@/components/ui/card"
import { FreshnessBadge } from "@/components/ui/freshness-badge"
import { FUNDING_TYPE_LABEL, INTERNATIONAL_LABEL } from "@/lib/admin/funding"
import { tableHref, type SearchParams } from "@/lib/admin/table"
import { requireStaff } from "@/lib/auth/staff-page"
import type { Tables } from "@/lib/db/database.types"
import { serviceClient } from "@/lib/db/service"

const nf = new Intl.NumberFormat("en-GB")
const DAY_MS = 86_400_000
const SOON_DAYS = 30
const input = "min-h-11 rounded-button border border-border bg-surface px-3 text-sm"
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

type Funding = Tables<"scholarship">

/** Funding for students: what it's worth, who can get it, and when. Data editors maintain it from official pages. */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection()
  await requireStaff("content")
  const params = await searchParams
  const country = one(params.country) ?? ""
  const international = one(params.international) ?? ""
  const editing = one(params.edit)
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const soon = new Date(now.getTime() + SOON_DAYS * DAY_MS).toISOString().slice(0, 10)

  const db = serviceClient()
  const [{ data }, { data: institutions }] = await Promise.all([
    db.from("scholarship").select("*").eq("is_demo", false).order("deadline", { nullsFirst: false }),
    db.from("university").select("id, name").eq("is_demo", false).order("name"),
  ])
  const all = data ?? []
  const names = new Map((institutions ?? []).map((i) => [i.id, i.name]))
  const rows = all.filter(
    (f) =>
      (!country || f.countries.includes(country as Funding["countries"][number])) &&
      (!international || (f.open_to_international ?? "unknown") === international)
  )
  const shown = all.filter((f) => f.open_to_international === "yes" || f.open_to_international === "limited")
  const counted = shown.filter((f) => f.eligible_from === "admission" && (!f.deadline || f.deadline >= today))
  const closingSoon = counted.filter((f) => f.deadline && f.deadline <= soon)

  const columns: Column<Funding>[] = [
    {
      key: "name",
      header: "Funding",
      sort: (f) => f.name,
      cell: (f) => (
        <span className="flex flex-col">
          <Link
            href={tableHref("/admin/funding", params, { edit: f.id })}
            scroll={false}
            className="font-medium underline underline-offset-4"
          >
            {f.name}
          </Link>
          <span className="text-xs text-muted-foreground">
            {f.funder} · {FUNDING_TYPE_LABEL[f.funding_type as keyof typeof FUNDING_TYPE_LABEL] ?? f.funding_type}
          </span>
        </span>
      ),
    },
    {
      key: "where",
      header: "Where",
      cell: (f) =>
        [
          f.countries.join(", "),
          f.regions.length ? f.regions.join(", ") : null,
          f.university_id ? names.get(f.university_id) : null,
        ]
          .filter(Boolean)
          .join(" · "),
    },
    {
      key: "international",
      header: "International",
      sort: (f) => f.open_to_international,
      cell: (f) =>
        f.open_to_international ? (
          <StatusBadge
            tone={
              f.open_to_international === "yes"
                ? "success"
                : f.open_to_international === "limited"
                  ? "warning"
                  : "danger"
            }
          >
            {INTERNATIONAL_LABEL[f.open_to_international as keyof typeof INTERNATIONAL_LABEL]}
          </StatusBadge>
        ) : (
          <StatusBadge tone="danger">Not stated: hidden</StatusBadge>
        ),
    },
    {
      key: "when",
      header: "Available",
      cell: (f) => (f.eligible_from === "admission" ? "On admission" : "After classes start (not counted)"),
    },
    {
      key: "value",
      header: "Value",
      align: "right",
      sort: (f) => f.amount_minor ?? f.percent_of_tuition,
      cell: (f) =>
        f.amount_minor !== null && f.currency
          ? `${f.currency} ${nf.format(f.amount_minor / 100)}`
          : f.percent_of_tuition
            ? `${f.percent_of_tuition}% of tuition`
            : f.coverage,
    },
    {
      key: "deadline",
      header: "Deadline",
      nowrap: true,
      sort: (f) => f.deadline,
      cell: (f) =>
        !f.deadline ? (
          "—"
        ) : f.deadline < today ? (
          <StatusBadge tone="neutral">Closed {f.deadline}</StatusBadge>
        ) : f.deadline <= soon ? (
          <StatusBadge tone="warning">{f.deadline}</StatusBadge>
        ) : (
          f.deadline
        ),
    },
    {
      key: "verified",
      header: "Verified",
      sort: (f) => f.last_verified_at,
      cell: (f) => <FreshnessBadge lastVerifiedAt={f.last_verified_at} now={now} sourceUrl={f.source_url} size="sm" />,
    },
  ]

  const editRecord = editing ? all.find((f) => f.id === editing) : undefined
  const chips: FilterChip[] = [
    ...(country ? [{ label: country, removeHref: tableHref("/admin/funding", params, { country: null }) }] : []),
    ...(international
      ? [
          {
            label: `International: ${international}`,
            removeHref: tableHref("/admin/funding", params, { international: null }),
          },
        ]
      : []),
  ]

  return (
    <>
      <PageHeader
        title="Funding"
        description="Scholarships, bursaries and awards from official pages. Students only see funding stated as open to international students; funding available only after classes start is never counted."
      />
      <KpiGrid columns={3}>
        <KpiTile
          label="Counted in results"
          value={nf.format(counted.length)}
          detail="Open to international, on admission, not closed"
          testId="funding-counted"
        />
        <KpiTile label="Closing within 30 days" value={nf.format(closingSoon.length)} />
        <KpiTile
          label="Hidden from students"
          value={nf.format(all.length - shown.length)}
          detail="Not open to international students, or it isn't stated"
        />
      </KpiGrid>
      <FilterBar chips={chips} resetHref="/admin/funding">
        <form method="get" className="flex flex-wrap items-end gap-2 text-sm" aria-label="Filter funding">
          <label className="flex flex-col gap-1">
            Country
            <select name="country" defaultValue={country} className={input}>
              <option value="">Any</option>
              <option value="CA">CA</option>
              <option value="UK">UK</option>
              <option value="US">US</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            International
            <select name="international" defaultValue={international} className={input}>
              <option value="">Any</option>
              <option value="yes">Open</option>
              <option value="limited">Limited</option>
              <option value="no">Not open</option>
              <option value="unknown">Not stated</option>
            </select>
          </label>
          <button type="submit" className={`${input} font-medium`}>
            Filter
          </button>
        </form>
      </FilterBar>
      <DataTable
        label="Funding"
        columns={columns}
        rows={rows}
        rowKey={(f) => f.id}
        rowProps={() => ({ "data-testid": "funding-row" })}
        path="/admin/funding"
        params={params}
        minWidth="56rem"
        empty="No funding recorded yet. Add the first one below."
      />
      <Card className="gap-3">
        <h2 className="font-heading text-base font-bold">Add funding</h2>
        <FundingForm record={null} institutions={institutions ?? []} />
      </Card>
      {editRecord && (
        <DetailDrawer
          title={`Edit: ${editRecord.name}`}
          closeHref={tableHref("/admin/funding", params, { edit: null })}
        >
          <FundingForm key={editRecord.id} record={editRecord} institutions={institutions ?? []} />
        </DetailDrawer>
      )}
    </>
  )
}
