import { formatShort, type Currency } from "@/lib/money"
import { BAND_LABEL, COUNTRY_LABEL, fieldLabel, TERM_LABEL } from "@/lib/match/labels"
import type { CardView, MatchView } from "@/lib/match/present"
import type { Catalogue, MatchProfile } from "@/lib/match/types"

/** Everything the report email and PDF show. Built only from database figures, never from the browser. */
export type ReportData = {
  preparedOn: string
  profile: { label: string; value: string }[]
  summary: string
  matches: ReportMatch[]
  /** Programmes that fit once the student has an English test score. */
  needsEnglish: {
    title: string
    university: string
    city: string
    country: string
    totalNgn: string | null
    ielts: number | null
  }[]
  closest: { title: string; university: string; gap: string; scholarships: string[] }[]
  restricted: { title: string; university: string; reason: string }[]
  proofOfFunds: { country: string; amount: string; source: string | null }[]
  deadlines: { date: string; label: string }[]
  scholarships: { name: string; funder: string; coverage: string; deadline: string | null; url: string }[]
  nextSteps: string[]
  fx: { currency: string; rate: number }[]
}

export type ReportMatch = {
  title: string
  university: string
  city: string
  country: string
  fit: number
  group: string
  totalNgn: string
  totalLocal: string
  budget: string
  nextDeadline: string
  why: string | null
  watchOut: string | null
  applyUrl: string | null
  sourceUrl: string
  verifiedDaysAgo: number
}

const TOP = 10
const DEADLINES = 6
const SCHOLARSHIPS = 6
const DAY_MS = 86_400_000

const GROUP: Record<string, string> = { strong: "Strong match", good: "Good match", reach: "Reach" }
const BUDGET: Record<string, string> = {
  within: "Within your budget",
  stretch: "A stretch on your budget",
  out_of_reach: "Over your budget",
  unknown: "Budget not given",
}
const TEST_LABEL: Record<string, string> = { ielts: "IELTS", toefl: "TOEFL iBT", pte: "PTE", duolingo: "Duolingo" }

export const dateLabel = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })

const ngn = (minor: string | bigint) => formatShort(BigInt(minor), "NGN")

function profileLines(profile: MatchProfile, view: MatchView): ReportData["profile"] {
  const english = (["ielts", "toefl", "pte", "duolingo"] as const)
    .filter((t) => profile[t] !== null && profile[t] !== undefined)
    .map((t) => `${TEST_LABEL[t]} ${profile[t]}`)
  const grade = view.band
    ? `${BAND_LABEL[view.band] ?? view.band}${view.grades_source === "estimated" ? " (estimated from your CGPA)" : ""}`
    : "Not given"
  return [
    { label: "Course", value: profile.field ? fieldLabel(profile.field) : "Any" },
    { label: "Grade", value: grade },
    { label: "English test", value: english.join(", ") || "Not taken yet" },
    {
      label: "Budget",
      value: profile.budget_total_minor === null ? "Not given" : ngn(BigInt(profile.budget_total_minor)),
    },
    {
      label: "Countries",
      value: profile.preferred_countries.map((c) => COUNTRY_LABEL[c] ?? c).join(", ") || "UK and Canada",
    },
    {
      label: "Intake",
      value: `${profile.target_term ? `${TERM_LABEL[profile.target_term] ?? profile.target_term} ` : ""}${profile.target_cycle}`,
    },
  ]
}

function match(card: CardView, why: { why: string; watch_out: string | null } | undefined, now: Date): ReportMatch {
  return {
    title: card.title,
    university: card.university,
    city: card.city,
    country: COUNTRY_LABEL[card.country] ?? card.country,
    fit: card.fit,
    group: GROUP[card.group] ?? card.group,
    totalNgn: ngn(card.cost.total_ngn_market),
    totalLocal: formatShort(BigInt(card.cost.total_minor), card.cost.currency as Currency),
    budget: BUDGET[card.cost.affordability] ?? card.cost.affordability,
    nextDeadline: `${card.next_deadline.label}: ${dateLabel(card.next_deadline.date)}`,
    why: why?.why ?? null,
    watchOut: why?.watch_out ?? null,
    applyUrl: card.apply_url,
    sourceUrl: card.source_url,
    verifiedDaysAgo: Math.max(0, Math.floor((now.getTime() - new Date(card.last_verified_at).getTime()) / DAY_MS)),
  }
}

export function buildReport(
  profile: MatchProfile,
  view: MatchView,
  catalogue: Pick<Catalogue, "visaRules" | "scholarships" | "requirements" | "programmes">,
  explanations: ReadonlyMap<string, { why: string; watch_out: string | null }>,
  now: Date
): ReportData {
  const cards = [...view.ranked, ...view.more].slice(0, TOP)
  const today = now.toISOString().slice(0, 10)
  const within = [...view.ranked, ...view.more].filter((c) => c.cost.affordability === "within")
  const best = cards[0]
  const summary = best
    ? `${within.length} programme${within.length === 1 ? "" : "s"} fit your budget. The strongest is ${best.title} at ${best.university}, at ${ngn(best.cost.total_ngn_market)} for the first year.`
    : view.needs_english.length
      ? `${view.needs_english.length} programme${view.needs_english.length === 1 ? "" : "s"} could fit once you have an English test score.`
      : (view.excluded.english ?? 0) > 0
        ? `${view.excluded.english} programme${view.excluded.english === 1 ? "" : "s"} need an English test score. Add the test you plan to take to see them.`
        : view.near_misses.length
          ? `Nothing fits your budget yet. The closest is ${view.near_misses[0]!.title}, ${ngn(view.near_misses[0]!.gap_ngn_minor)} over.`
          : "Nothing matches yet. Try widening your countries or course."

  // Proof of funds: the figure on the first card for each country, with that country's current rule.
  const countries = [...new Set(cards.map((c) => c.country))]
  const proofOfFunds = countries.flatMap((country) => {
    const card = cards.find((c) => c.country === country && c.cost.proof_of_funds_minor)
    if (!card?.cost.proof_of_funds_minor) return []
    const rule = catalogue.visaRules
      .filter((r) => r.country === country && r.rule_type === "proof_of_funds" && r.effective_from <= today)
      .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0]
    return {
      country: COUNTRY_LABEL[country] ?? country,
      amount: `${formatShort(BigInt(card.cost.proof_of_funds_minor), card.cost.currency as Currency)} for ${card.title}`,
      source: rule?.source_url ?? null,
    }
  })

  const deadlines = cards
    .map((c) => ({ date: c.next_deadline.date, label: `${c.title}, ${c.university} (${c.next_deadline.label})` }))
    .filter((d) => d.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, DEADLINES)
    .map((d) => ({ date: dateLabel(d.date), label: d.label }))

  const shownCountries = new Set(countries)
  const scholarships = catalogue.scholarships
    .filter(
      (s) =>
        (s.countries.length === 0 || s.countries.some((c) => shownCountries.has(c))) &&
        (s.fields.length === 0 || (profile.field !== null && s.fields.includes(profile.field))) &&
        (s.eligible_nationalities.length === 0 || s.eligible_nationalities.includes(profile.nationality)) &&
        (!s.deadline || s.deadline >= today)
    )
    .slice(0, SCHOLARSHIPS)
    .map((s) => ({
      name: s.name,
      funder: s.funder,
      coverage: s.coverage,
      deadline: s.deadline ? dateLabel(s.deadline) : null,
      url: s.url,
    }))

  const nextSteps: string[] = []
  const hasEnglish = ["ielts", "toefl", "pte", "duolingo"].some(
    (t) => profile[t as "ielts"] !== null && profile[t as "ielts"] !== undefined
  )
  const ielts = [...cards, ...view.needs_english].map((c) => c.ielts_min).filter((n): n is number => n !== null)
  if (!hasEnglish) {
    nextSteps.push(
      ielts.length
        ? `Book an English test. Your top matches ask for IELTS ${Math.min(...ielts)} to ${Math.max(...ielts)} overall.`
        : "Book an English test (IELTS Academic or TOEFL iBT)."
    )
  }
  const ids = new Set(cards.map((c) => c.id))
  const documents = [
    ...new Set(
      catalogue.requirements.filter((r) => ids.has(r.programme_id)).flatMap((r) => (r.documents ?? []) as string[])
    ),
  ]
  if (documents.length) nextSteps.push(`Prepare your documents: ${documents.slice(0, 8).join(", ")}.`)
  if (deadlines[0]) nextSteps.push(`Your first deadline is ${deadlines[0].date}: ${deadlines[0].label}.`)
  for (const p of proofOfFunds) nextSteps.push(`Plan to show ${p.amount.split(" for ")[0]} for a ${p.country} visa.`)

  return {
    preparedOn: dateLabel(today),
    profile: profileLines(profile, view),
    summary,
    matches: cards.map((c) => match(c, explanations.get(c.id), now)),
    needsEnglish: view.needs_english.slice(0, TOP).map((n) => ({
      title: n.title,
      university: n.university,
      city: n.city,
      country: COUNTRY_LABEL[n.country] ?? n.country,
      totalNgn: n.cost ? ngn(n.cost.total_ngn_market) : null,
      ielts: n.ielts_min,
    })),
    closest: view.near_misses.slice(0, 5).map((n) => ({
      title: n.title,
      university: n.university,
      gap: `${ngn(n.gap_ngn_minor)} over your budget`,
      scholarships: n.scholarships.map((s) => s.name),
    })),
    restricted: view.restricted.map((r) => ({ title: r.title, university: r.university, reason: r.reason })),
    proofOfFunds,
    deadlines,
    scholarships,
    nextSteps,
    fx: Object.entries(view.fx.market).map(([currency, rate]) => ({ currency, rate: rate as number })),
  }
}
