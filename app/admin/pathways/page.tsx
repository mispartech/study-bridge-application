import Link from "next/link"
import { connection } from "next/server"

import { PageHeader } from "@/components/admin/page-header"
import { PathwayForm } from "@/components/admin/pathway-form"
import { EmptyState } from "@/components/admin/states"
import { Card } from "@/components/ui/card"
import type { SearchParams } from "@/lib/admin/table"
import { requireStaff } from "@/lib/auth/staff-page"
import { serviceClient } from "@/lib/db/service"
import { demoModeEnabled, loadCatalogue, toPathways } from "@/lib/match/catalogue"
import { nextCycle } from "@/lib/match/labels"
import { SIGNALS, type Pathway } from "@/lib/match/pathways"
import { rank } from "@/lib/match/rank"
import { matchProfile, type RankedProgramme } from "@/lib/match/types"

const PREVIEW_SIZE = 5
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

/** The worked example student, used only to preview what a pathway changes. */
const sampleProfile = (now: Date, goals: string[]) =>
  matchProfile.parse({
    nationality: "NG",
    degree_class: "upper_second",
    cgpa: 3.8,
    cgpa_scale: 5,
    field: "computer_data_science",
    ielts: 7,
    budget_total_minor: 8_000_000_000,
    target_cycle: nextCycle(now),
    target_term: "fall",
    accommodation_pref: "university_halls",
    goals,
  })

function Top({ title, rows }: { title: string; rows: RankedProgramme[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No matches.</p>
      ) : (
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm">
          {rows.map((r) => (
            <li key={r.bundle.programme.id}>
              <span className="font-medium">{r.bundle.programme.title}</span>
              <span className="text-muted-foreground"> · {r.bundle.university.name}</span>
              {(r.goal_signals ?? []).length > 0 && (
                <span className="block text-xs text-primary-strong">
                  {(r.goal_signals ?? []).map((s) => SIGNALS[s].label).join(" · ")}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/**
 * What students can choose as their goal after studying, and how each goal weighs the matching signals. Nothing
 * here is hard-coded: changes reach students' results within a few minutes, and every save is audited.
 */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection()
  await requireStaff("settings")
  const params = await searchParams
  const db = serviceClient()
  const [{ data: rows }, { data: signals }, catalogue] = await Promise.all([
    db.from("pathway").select("key, label, description, active, sort_order").order("sort_order"),
    db.from("pathway_signal").select("pathway_key, signal, weight"),
    loadCatalogue(demoModeEnabled()),
  ])
  const pathways: Pathway[] = toPathways(rows ?? [], signals ?? [])
  const previewKey = one(params.preview) ?? pathways.find((p) => p.active)?.key ?? pathways[0]?.key
  const previewed = pathways.find((p) => p.key === previewKey)

  let before: RankedProgramme[] = []
  let after: RankedProgramme[] = []
  if (previewed) {
    const now = new Date()
    const options = { now, demoMode: demoModeEnabled() }
    // Preview with every pathway (switched-off ones too), so an admin can try one before turning it on.
    const withAll = { ...catalogue, pathways: pathways.map((p) => ({ ...p, active: true })) }
    before = rank(sampleProfile(now, []), withAll, options).ranked.slice(0, PREVIEW_SIZE)
    after = rank(sampleProfile(now, [previewed.key]), withAll, options).ranked.slice(0, PREVIEW_SIZE)
  }

  return (
    <>
      <PageHeader
        title="Pathways"
        description="The goals students can choose after studying, and how much each signal counts for each goal. Results follow these weights; nothing is hard-coded. Every save is in the audit log."
      />

      <Card className="gap-3" data-testid="pathway-preview">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-base font-bold">Preview</h2>
          <nav aria-label="Preview a pathway" className="flex flex-wrap gap-2 text-sm">
            {pathways.map((p) => (
              <Link
                key={p.key}
                href={`/admin/pathways?preview=${p.key}`}
                scroll={false}
                aria-current={p.key === previewKey ? "true" : undefined}
                className={
                  p.key === previewKey
                    ? "rounded-full bg-primary-tint px-3 py-1 font-medium text-primary-strong"
                    : "rounded-full border border-border px-3 py-1"
                }
              >
                {p.label}
              </Link>
            ))}
          </nav>
        </div>
        <p className="text-sm text-muted-foreground">
          Top {PREVIEW_SIZE} for a sample student (Computer science, 2:1, IELTS 7, ₦80m), with no goal and with the
          chosen one. Save a change first to see its effect.
        </p>
        {previewed ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Top title="No goal chosen" rows={before} />
            <Top title={`With “${previewed.label}”`} rows={after} />
          </div>
        ) : (
          <EmptyState title="No pathways yet" description="Add one below." />
        )}
      </Card>

      {pathways.map((p) => (
        <PathwayForm key={`${p.key}-${JSON.stringify(p)}`} pathway={p} />
      ))}
      <PathwayForm pathway={null} />
    </>
  )
}
