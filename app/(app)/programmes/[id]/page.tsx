import type { Metadata } from "next"
import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import { connection } from "next/server"
import { Suspense } from "react"

import { ApplyLink } from "@/components/analytics/apply-link"
import { ReportError } from "@/components/match/report-error"
import { CostSheet } from "@/components/match/cost-sheet"
import { IncludesEstimates } from "@/components/match/estimated-tag"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Chip } from "@/components/ui/chip"
import { FreshnessBadge } from "@/components/ui/freshness-badge"
import { VisaStatusChip } from "@/components/ui/visa-status-chip"
import {
  bundles,
  eligibleScholarships,
  matchProfile,
  normaliseAcademics,
  ruleOn,
  totalCost,
  visaApplicationDate,
  visaRestriction,
  type Catalogue,
  type MatchOptions,
} from "@/lib/match"
import { loadAccount } from "@/lib/account/current-account"
import { hasSessionCookie } from "@/lib/auth/server"
import { demoModeEnabled, loadCatalogue } from "@/lib/match/catalogue"
import { parseProfileCookie, PROFILE_COOKIE } from "@/lib/match/draft"
import { ACCOMMODATION_LABEL, BAND_LABEL, COUNTRY_LABEL, nextCycle, TERM_LABEL } from "@/lib/match/labels"
import { isOfficialUrl } from "@/lib/match/official-url"
import { presentCost, presentResult } from "@/lib/match/present"
import { formatShort, type Currency } from "@/lib/money"

export const metadata: Metadata = { title: "Programme", robots: { index: false } }

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="gap-2">
      <h2 className="font-heading text-lg font-bold">{title}</h2>
      <div className="flex flex-col gap-2 text-sm">{children}</div>
    </Card>
  )
}

const TEST_LABEL: Record<string, string> = {
  required: "Required",
  one_of_required: "GRE or GMAT required",
  optional: "Optional",
  not_required: "Not required",
}

function fxFor(catalogue: Catalogue, now: Date) {
  const empty = { ranked: [], more: [], near_misses: [], restricted: [], needs_english: [], excluded: [] }
  const profile = matchProfile.parse({ target_cycle: nextCycle(now) })
  const academics = normaliseAcademics(profile, catalogue.gradeMappings)
  return presentResult({ academics, ...empty }, profile, catalogue, now).fx
}

async function Programme({ params }: { params: Promise<{ id: string }> }) {
  await connection()
  const { id } = await params
  const store = await cookies()
  const demoMode = demoModeEnabled()
  const catalogue = await loadCatalogue(demoMode)
  const now = new Date()
  const options: MatchOptions = { now, demoMode }
  const bundle = bundles(catalogue, demoMode).find((b) => b.programme.id === id)
  if (!bundle) notFound()

  const { programme, university, requirement } = bundle
  const account = hasSessionCookie(store.getAll()) ? await loadAccount() : null
  const profile =
    account?.profile ??
    parseProfileCookie(store.get(PROFILE_COOKIE)?.value) ??
    matchProfile.parse({ target_cycle: nextCycle(now) })
  const academics = normaliseAcademics(profile, catalogue.gradeMappings)
  const today = now.toISOString().slice(0, 10)
  const intakes = bundle.intakes.filter((i) => i.cycle === profile.target_cycle)
  const intake = intakes[0] ?? bundle.intakes[0]
  const costed = intake ? totalCost(bundle, intake, profile, catalogue, options) : null
  const cost = costed && "cost" in costed ? presentCost(costed.cost) : null
  const restriction = visaRestriction(university.country, profile, catalogue, options)
  const scholarships = eligibleScholarships(bundle, profile, academics, catalogue, options)
  const work = intake
    ? ruleOn(
        catalogue.visaRules,
        { country: university.country, type: "post_study_work", demoMode },
        visaApplicationDate(intake)
      )
    : undefined
  const cityCosts = catalogue.cityCosts.filter((c) => c.country === university.country && c.city === university.city)
  const applyAllowed = isOfficialUrl(programme.apply_url, university.official_domains) && !restriction
  const toefl = (requirement?.toefl_entries ?? []) as { scale: string; overall_min: number }[]
  const fx = fxFor(catalogue, now)

  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl leading-tight font-extrabold">{programme.title}</h1>
        <p className="text-muted-foreground">
          {university.name.replace(/^Demo — /, "")}, {university.city}, {COUNTRY_LABEL[university.country]}
        </p>
        <div className="flex flex-wrap gap-2">
          <FreshnessBadge lastVerifiedAt={programme.last_verified_at} now={now} sourceUrl={programme.source_url} />
          <VisaStatusChip
            status={restriction ? "suspended" : "open"}
            label={restriction ? "Restricted for your nationality" : "Open"}
          />
        </div>
        {restriction && <p className="text-sm">{restriction.description}</p>}
      </header>

      <Section title="Overview">
        <p>{programme.description}</p>
        <div className="flex flex-wrap gap-2">
          <Chip size="sm">{programme.degree_type}</Chip>
          <Chip size="sm">{programme.duration_months} months</Chip>
          {programme.has_coop_or_placement && <Chip size="sm">Co-op or placement</Chip>}
          {programme.stem_designated && <Chip size="sm">STEM designated</Chip>}
        </div>
      </Section>

      {requirement && (
        <Section title="Entry rules">
          <p>Minimum degree: {BAND_LABEL[requirement.min_uk_class] ?? requirement.min_uk_class}.</p>
          {requirement.nigeria_rule && <p>For Nigerian applicants: {requirement.nigeria_rule}</p>}
          {requirement.min_work_years > 0 && <p>Work experience: at least {requirement.min_work_years} years.</p>}
        </Section>
      )}

      {requirement && (
        <Section title="English and test requirements">
          {requirement.ielts_min !== null && <p>IELTS {requirement.ielts_min}</p>}
          {toefl.map((t) => (
            <p key={t.scale}>
              TOEFL {t.overall_min} ({t.scale} scale)
            </p>
          ))}
          {requirement.duolingo_min !== null && <p>Duolingo {requirement.duolingo_min}</p>}
          {requirement.pte_min !== null && <p>PTE {requirement.pte_min}</p>}
          {requirement.waec_english_accepted && requirement.waec_min_grade && (
            <p>WAEC or NECO English at {requirement.waec_min_grade} or better is accepted.</p>
          )}
          <p>GRE: {requirement.gre_status ? TEST_LABEL[requirement.gre_status] : "Check test requirement"}</p>
          <p>GMAT: {requirement.gmat_status ? TEST_LABEL[requirement.gmat_status] : "Check test requirement"}</p>
        </Section>
      )}

      <Section title="Fees and total cost">
        {bundle.fee && (
          <p>
            Tuition {bundle.fee.fee_year}:{" "}
            <span className="money font-medium">
              {formatShort(BigInt(bundle.fee.tuition_per_year_minor), bundle.fee.currency as Currency)}
            </span>
          </p>
        )}
        {cost ? (
          <>
            <CostSheet title={programme.title} cost={cost} fx={fx}>
              <span className="money text-xl font-bold">
                {formatShort(BigInt(cost.total_ngn_market), "NGN")} first year
              </span>
            </CostSheet>
            <IncludesEstimates />
          </>
        ) : (
          <p className="text-muted-foreground">We can&apos;t total this yet: a cost record is missing.</p>
        )}
      </Section>

      <Section title="Intakes and deadlines">
        {bundle.intakes.map((i) => (
          <div key={i.id}>
            <p className="font-medium">
              {TERM_LABEL[i.start_term]} {i.cycle}
              {i.start_month ? `, starts ${i.start_month.slice(0, 7)}` : ""}
            </p>
            {((i.deadlines ?? []) as { label: string; date: string }[]).map((d) => (
              <p key={d.date} className={d.date <= today ? "text-muted-foreground line-through" : undefined}>
                {d.label}: {d.date}
              </p>
            ))}
          </div>
        ))}
      </Section>

      <Section title="Scholarships">
        {scholarships.length === 0 && <p className="text-muted-foreground">None open that match you yet.</p>}
        {scholarships.map((s) => (
          <p key={s.id}>
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
              {s.name.replace(/^Demo — /, "")}
            </a>
            {s.amount_minor && s.currency ? `: ${formatShort(BigInt(s.amount_minor), s.currency as Currency)}` : ""}
            {s.deadline ? `, apply by ${s.deadline}` : ""}
          </p>
        ))}
      </Section>

      <Section title="Post-study work">
        <p>{work?.description ?? "We don't have a verified rule for this country yet."}</p>
      </Section>

      <Section title="City and accommodation">
        {cityCosts.map((c) => (
          <p key={c.id}>
            {ACCOMMODATION_LABEL[c.accommodation_type]}:{" "}
            {formatShort(BigInt(c.rent_monthly_low_minor), c.currency as Currency)} to{" "}
            {formatShort(BigInt(c.rent_monthly_high_minor), c.currency as Currency)} a month
          </p>
        ))}
      </Section>

      {applyAllowed && (
        <Button asChild size="lg" block variant="accent">
          <ApplyLink href={programme.apply_url}>Apply on university site</ApplyLink>
        </Button>
      )}
      <ReportError programmeId={programme.id} />
    </article>
  )
}

export default function Page({ params }: PageProps<"/programmes/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading programme…</p>}>
      <Programme params={params} />
    </Suspense>
  )
}
