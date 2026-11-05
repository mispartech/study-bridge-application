import { tool, type ToolSet } from "ai"
import { z } from "zod"

import { ACCOMMODATION_TYPES } from "@/lib/match/labels"
import {
  bundles,
  eligibleScholarships,
  normaliseAcademics,
  rank,
  totalCost,
  visaRestriction,
  type Bundle,
  type Catalogue,
  type Cost,
  type MatchOptions,
  type MatchProfile,
  type RankedProgramme,
} from "@/lib/match"
import { isOfficialUrl } from "@/lib/match/official-url"
import { toNgn } from "@/lib/match/cost"
import { formatShort, type Currency } from "@/lib/money"

const FRESHNESS_DAYS = 120
const DAY_MS = 86_400_000
const DEFAULT_RESULTS = 3
const MAX_RESULTS = 5

export type Source = { label: string; source_url: string; last_verified_at: string }

export type ProgrammeCard = {
  id: string
  title: string
  university: string
  city: string
  country: string
  degree: string
  duration_months: number
  has_coop: boolean
  total_first_year: string | null
  total_first_year_local: string | null
  affordability: string | null
  student_budget: string | null
  budget_left_after: string | null
  over_budget_by: string | null
  next_deadline: { label: string; date: string } | null
  apply_url: string | null
  /** Older than the 120-day limit: the advisor has to say so. */
  stale: boolean
  source_url: string
  last_verified_at: string
}

export type AdvisorContext = {
  profile: MatchProfile
  catalogue: Catalogue
  options: MatchOptions
  addToShortlist: (programmeId: string) => Promise<"added" | "limit" | "no_profile" | "error">
}

const isStale = (lastVerifiedAt: string, now: Date) =>
  now.getTime() - new Date(lastVerifiedAt).getTime() > FRESHNESS_DAYS * DAY_MS

const money = (minor: bigint, currency: string) => formatShort(minor, currency as Currency)

/** The naira figure R1 has to lead with, at the same market rate as every total. */
function naira(minor: bigint, currency: string, ctx: AdvisorContext) {
  const converted = toNgn(minor, currency, "market", ctx.catalogue.fxRates, ctx.options.demoMode)
  return converted === undefined ? null : money(converted, "NGN")
}

/** Amounts held in a visa rule's value, e.g. { visa_fee_gbp: 524 }, shown in local money and naira. */
function ruleAmounts(value: unknown, ruleType: string, ctx: AdvisorContext) {
  const amounts = Object.entries((value ?? {}) as Record<string, unknown>).flatMap(([key, amount]) => {
    const match = key.match(/^(.*?)_?(gbp|cad|usd)(?:_(.*))?$/)
    if (!match || typeof amount !== "number") return []
    const currency = match[2]!.toUpperCase()
    const minor = BigInt(Math.round(amount * 100))
    return { item: [match[1], match[3]].filter(Boolean).join(" ").replace(/_/g, " "), minor, currency }
  })
  const lines = amounts.map(({ item, minor, currency }) => ({
    item,
    local: money(minor, currency),
    ngn: naira(minor, currency, ctx),
  }))
  if (ruleType !== "government_fee" || amounts.length < 2) return lines
  const currency = amounts[0]!.currency
  const total = amounts.reduce((sum, a) => sum + a.minor, 0n)
  return [...lines, { item: "total", local: money(total, currency), ngn: naira(total, currency, ctx) }]
}

function budgetFigures(cost: Cost | null, ctx: AdvisorContext) {
  const budget = ctx.profile.budget_total_minor
  if (budget === null) return { student_budget: null, budget_left_after: null, over_budget_by: null }
  const left = cost ? BigInt(budget) - cost.total_ngn.market : null
  return {
    student_budget: money(BigInt(budget), "NGN"),
    budget_left_after: left !== null && left >= 0n ? money(left, "NGN") : null,
    over_budget_by: left !== null && left < 0n ? money(-left, "NGN") : null,
  }
}

function card(
  bundle: Bundle,
  cost: Cost | null,
  next: ProgrammeCard["next_deadline"],
  ctx: AdvisorContext
): ProgrammeCard {
  const { programme, university } = bundle
  const now = ctx.options.now
  return {
    id: programme.id,
    title: programme.title,
    university: university.name,
    city: university.city,
    country: university.country,
    degree: programme.degree_type,
    duration_months: programme.duration_months,
    has_coop: programme.has_coop_or_placement,
    total_first_year: cost ? money(cost.total_ngn.market, "NGN") : null,
    total_first_year_local: cost ? money(cost.total_minor, cost.currency) : null,
    affordability: cost?.affordability ?? null,
    ...budgetFigures(cost, ctx),
    next_deadline: next,
    apply_url: isOfficialUrl(programme.apply_url, university.official_domains) ? programme.apply_url : null,
    stale: isStale(programme.last_verified_at, now),
    source_url: programme.source_url,
    last_verified_at: programme.last_verified_at,
  }
}

const sourceOf = (c: ProgrammeCard): Source => ({
  label: `${c.title}, ${c.university}`,
  source_url: c.source_url,
  last_verified_at: c.last_verified_at,
})

function firstIntake(bundle: Bundle, profile: MatchProfile) {
  return bundle.intakes.find((i) => i.cycle === profile.target_cycle) ?? bundle.intakes[0]
}

function costOf(bundle: Bundle, ctx: AdvisorContext, accommodation?: MatchProfile["accommodation_pref"]) {
  const intake = firstIntake(bundle, ctx.profile)
  if (!intake) return null
  const profile = accommodation ? { ...ctx.profile, accommodation_pref: accommodation } : ctx.profile
  const costed = totalCost(bundle, intake, profile, ctx.catalogue, ctx.options)
  return "cost" in costed ? costed.cost : null
}

function nextDeadline(bundle: Bundle, today: string) {
  const dates = bundle.intakes
    .flatMap((i) => (i.deadlines ?? []) as { label: string; date: string }[])
    .filter((d) => d.date > today)
    .sort((a, b) => a.date.localeCompare(b.date))
  return dates[0] ?? null
}

function programmeCard(bundle: Bundle, ctx: AdvisorContext) {
  const today = ctx.options.now.toISOString().slice(0, 10)
  return card(bundle, costOf(bundle, ctx), nextDeadline(bundle, today), ctx)
}

const find = (id: string, ctx: AdvisorContext) =>
  bundles(ctx.catalogue, ctx.options.demoMode).find((b) => b.programme.id === id)

const notFound = { found: false, message: "No programme with that id in the database.", sources: [] as Source[] }

const costLines = (cost: Cost, ctx: AdvisorContext) =>
  cost.lines
    .filter((l) => l.amount_minor > 0n)
    .map((l) => ({
      item: l.label,
      amount: money(l.amount_minor, l.currency),
      ngn: naira(l.amount_minor, l.currency, ctx),
      estimated: l.estimated,
    }))

const rankedCard = (r: RankedProgramme, ctx: AdvisorContext) => card(r.bundle, r.cost, r.next_deadline, ctx)

type SearchFilters = {
  title_contains?: string
  university_contains?: string
  field?: MatchProfile["field"]
  country?: "UK" | "CA" | "US"
  city?: string
  max_total_ngn_millions?: number
  limit?: number
}

const contains = (text: string, part?: string) => !part || text.toLowerCase().includes(part.toLowerCase())

/** A programme the student names is looked up directly: their budget and field don't hide it. */
function namedProgrammes(filters: SearchFilters, ctx: AdvisorContext) {
  const { profile, catalogue, options } = ctx
  const named = bundles(catalogue, options.demoMode).filter(
    (b) =>
      contains(b.programme.title, filters.title_contains) &&
      contains(b.university.name, filters.university_contains) &&
      (!filters.country || b.university.country === filters.country) &&
      contains(b.university.city, filters.city)
  )
  const limit = Math.min(filters.limit ?? MAX_RESULTS, MAX_RESULTS)
  const blocked = (b: Bundle) => visaRestriction(b.university.country, profile, catalogue, options)
  const cards = named
    .filter((b) => !blocked(b))
    .slice(0, limit)
    .map((b) => programmeCard(b, ctx))
  const restricted = named
    .filter(blocked)
    .slice(0, limit)
    .map((b) => {
      const rule = blocked(b)!
      return {
        title: b.programme.title,
        university: b.university.name,
        country: b.university.country,
        reason: rule.description,
        source_url: rule.source_url,
      }
    })
  return { programmes: cards, near_misses: [], restricted_for_this_student: restricted, sources: cards.map(sourceOf) }
}

export function programmeSearch(filters: SearchFilters, ctx: AdvisorContext) {
  const { profile, catalogue, options } = ctx
  if (filters.title_contains || filters.university_contains) return namedProgrammes(filters, ctx)
  const hasEnglish = [profile.ielts, profile.toefl, profile.duolingo, profile.pte].some((s) => s !== null)
  const budget = filters.max_total_ngn_millions
  const searching: MatchProfile = {
    ...profile,
    field: filters.field ?? profile.field,
    quick_match: !hasEnglish,
    budget_total_minor: budget ? budget * 100_000_000 : profile.budget_total_minor,
  }
  const result = rank(searching, catalogue, options)
  const wanted = (b: Bundle) =>
    (!filters.country || b.university.country === filters.country) &&
    (!filters.city || b.university.city.toLowerCase() === filters.city.toLowerCase())
  const limit = Math.min(filters.limit ?? DEFAULT_RESULTS, MAX_RESULTS)
  const programmes = [...result.ranked, ...result.more].filter((r) => wanted(r.bundle)).slice(0, limit)
  const cards = programmes.map((r) => rankedCard(r, ctx))
  const nearMisses = result.near_misses
    .filter((n) => wanted(n.bundle))
    .slice(0, limit)
    .map((n) => card(n.bundle, n.cost, n.next_deadline, ctx))
  const restricted = result.restricted
    .filter((r) => wanted(r.bundle))
    .slice(0, limit)
    .map((r) => ({
      title: r.bundle.programme.title,
      university: r.bundle.university.name,
      country: r.bundle.university.country,
      reason: r.reason,
      source_url: r.source_url,
    }))
  return {
    programmes: cards,
    near_misses: nearMisses,
    restricted_for_this_student: restricted,
    sources: [...cards, ...nearMisses].map(sourceOf),
  }
}

export function programmeDetail(id: string, ctx: AdvisorContext) {
  const bundle = find(id, ctx)
  if (!bundle) return notFound
  const { requirement, programme, university } = bundle
  const summary = programmeCard(bundle, ctx)
  const restriction = visaRestriction(university.country, ctx.profile, ctx.catalogue, ctx.options)
  return {
    found: true,
    programme: summary,
    programmes: [summary],
    field: programme.field,
    description: programme.description,
    entry: requirement && {
      min_uk_class: requirement.min_uk_class,
      min_gpa4: requirement.min_gpa4,
      nigeria_rule: requirement.nigeria_rule,
      min_work_years: requirement.min_work_years,
      ielts_min: requirement.ielts_min,
      toefl: requirement.toefl_entries,
      duolingo_min: requirement.duolingo_min,
      pte_min: requirement.pte_min,
      waec_min_grade: requirement.waec_english_accepted ? requirement.waec_min_grade : null,
      gre: requirement.gre_status,
      gmat: requirement.gmat_status,
    },
    tuition: bundle.fee && {
      fee_year: bundle.fee.fee_year,
      amount: money(BigInt(bundle.fee.tuition_per_year_minor), bundle.fee.currency),
      amount_ngn: naira(BigInt(bundle.fee.tuition_per_year_minor), bundle.fee.currency, ctx),
    },
    intakes: bundle.intakes.map((i) => ({
      term: i.start_term,
      cycle: i.cycle,
      start_month: i.start_month,
      deadlines: i.deadlines,
    })),
    visa_restricted_for_this_student: restriction?.description ?? null,
    sources: [
      sourceOf(summary),
      ...(requirement
        ? [
            {
              label: "Entry requirements",
              source_url: requirement.source_url,
              last_verified_at: requirement.last_verified_at,
            },
          ]
        : []),
    ],
  }
}

export function costBreakdown(
  id: string,
  accommodation: MatchProfile["accommodation_pref"] | undefined,
  ctx: AdvisorContext
) {
  const bundle = find(id, ctx)
  if (!bundle) return notFound
  const cost = costOf(bundle, ctx, accommodation)
  if (!cost) return { found: false, message: "A cost record is missing for this programme.", sources: [] as Source[] }
  const proof = cost.proof_of_funds_minor
  return {
    found: true,
    programme: bundle.programme.title,
    accommodation: cost.accommodation,
    asked_for_accommodation_available: cost.accommodation_available,
    total_first_year: money(cost.total_ngn.market, "NGN"),
    total_at_official_rate: money(cost.total_ngn.official, "NGN"),
    total_first_year_local: money(cost.total_minor, cost.currency),
    lines: costLines(cost, ctx),
    visa_proof_of_funds: proof === null ? null : money(proof, cost.currency),
    visa_proof_of_funds_ngn: proof === null ? null : naira(proof, cost.currency, ctx),
    affordability: cost.affordability,
    ...budgetFigures(cost, ctx),
    programmes: [programmeCard(bundle, ctx)],
    sources: cost.lines.map((l) => ({
      label: l.label,
      source_url: l.source_url,
      last_verified_at: bundle.fee?.last_verified_at ?? bundle.programme.last_verified_at,
    })),
  }
}

export function scholarshipSearch(country: "UK" | "CA" | "US" | undefined, ctx: AdvisorContext) {
  const { profile, catalogue, options } = ctx
  const academics = normaliseAcademics(profile, catalogue.gradeMappings)
  const pool = bundles(catalogue, options.demoMode).filter((b) => !country || b.university.country === country)
  const eligible = new Map(
    pool.flatMap((b) => eligibleScholarships(b, profile, academics, catalogue, options)).map((s) => [s.id, s])
  )
  const scholarships = [...eligible.values()].map((s) => ({
    name: s.name,
    funder: s.funder,
    countries: s.countries,
    amount: s.amount_minor && s.currency ? money(BigInt(s.amount_minor), s.currency) : null,
    amount_ngn: s.amount_minor && s.currency ? naira(BigInt(s.amount_minor), s.currency, ctx) : null,
    coverage: s.coverage,
    deadline: s.deadline,
    url: s.url,
    stale: isStale(s.last_verified_at, options.now),
    source_url: s.source_url,
    last_verified_at: s.last_verified_at,
  }))
  return {
    scholarships,
    sources: scholarships.map((s) => ({
      label: s.name,
      source_url: s.source_url,
      last_verified_at: s.last_verified_at,
    })),
  }
}

export function visaRules(country: "UK" | "CA" | "US", nationality: string | undefined, ctx: AdvisorContext) {
  const { catalogue, options, profile } = ctx
  const today = options.now.toISOString().slice(0, 10)
  const who = { nationality: nationality ?? profile.nationality, travel_document: profile.travel_document }
  const restriction = visaRestriction(country, who, catalogue, options)
  const rules = catalogue.visaRules
    .filter(
      (r) =>
        r.country === country &&
        r.rule_type !== "nationality_restriction" &&
        (options.demoMode || !r.is_demo) &&
        (r.effective_to === null || r.effective_to >= today)
    )
    .map((r) => ({
      type: r.rule_type,
      description: r.description,
      amounts: ruleAmounts(r.value, r.rule_type, ctx),
      effective_from: r.effective_from,
      effective_to: r.effective_to,
      in_force_today: r.effective_from <= today,
      is_demo_figure: r.is_demo,
      source_url: r.source_url,
      last_verified_at: r.last_verified_at,
    }))
  return {
    country,
    nationality: who.nationality,
    restricted: restriction
      ? { description: restriction.description, source_url: restriction.source_url, review_due: restriction.review_due }
      : null,
    rules,
    sources: [
      ...(restriction
        ? [
            {
              label: "Visa restriction",
              source_url: restriction.source_url,
              last_verified_at: restriction.last_verified_at,
            },
          ]
        : []),
      ...rules.map((r) => ({
        label: r.description,
        source_url: r.source_url,
        last_verified_at: r.last_verified_at,
      })),
    ],
  }
}

export function comparison(ids: string[], ctx: AdvisorContext) {
  const details = ids.flatMap((id) => {
    const bundle = find(id, ctx)
    if (!bundle) return []
    const cost = costOf(bundle, ctx)
    return {
      card: programmeCard(bundle, ctx),
      ielts_min: bundle.requirement?.ielts_min ?? null,
      min_uk_class: bundle.requirement?.min_uk_class ?? null,
      gre: bundle.requirement?.gre_status ?? null,
      proof_of_funds: cost?.proof_of_funds_minor ? money(cost.proof_of_funds_minor, cost.currency) : null,
      proof_of_funds_ngn: cost?.proof_of_funds_minor ? naira(cost.proof_of_funds_minor, cost.currency, ctx) : null,
    }
  })
  const totals = ids.flatMap((id) => {
    const bundle = find(id, ctx)
    const total = bundle && costOf(bundle, ctx)?.total_ngn.market
    return total === undefined ? [] : [total]
  })
  const spread =
    totals.length < 2 ? null : totals.reduce((a, b) => (a > b ? a : b)) - totals.reduce((a, b) => (a < b ? a : b))
  return {
    comparison: details,
    gap_between_totals: spread === null ? null : money(spread, "NGN"),
    programmes: details.map((d) => d.card),
    sources: details.map((d) => sourceOf(d.card)),
  }
}

const fieldCode = z.enum([
  "computer_data_science",
  "public_health",
  "business_finance",
  "engineering",
  "project_management",
  "law",
])
const country = z.enum(["UK", "CA", "US"])

/** The advisor's only route to facts: every result carries its records' source_url and last_verified_at. */
export function advisorTools(ctx: AdvisorContext): ToolSet {
  return {
    search_programmes: tool({
      description:
        "Find programmes for this student. Filter by title words, field, country, city or a maximum total cost. Also returns near misses and programmes restricted for this student.",
      inputSchema: z.object({
        title_contains: z.string().optional().describe("Words from the programme title, e.g. Data Analytics"),
        university_contains: z.string().optional().describe("Part of the university name, e.g. Northmoor"),
        field: fieldCode.optional(),
        country: country.optional(),
        city: z.string().optional(),
        max_total_ngn_millions: z.number().positive().optional(),
        limit: z.number().int().min(1).max(MAX_RESULTS).optional(),
      }),
      execute: async (filters) => programmeSearch(filters, ctx),
    }),
    get_programme: tool({
      description: "Full details for one programme: entry rules, English tests, tuition, intakes and deadlines.",
      inputSchema: z.object({ id: z.string().describe("Programme id from search_programmes") }),
      execute: async ({ id }) => programmeDetail(id, ctx),
    }),
    cost_breakdown: tool({
      description: "First-year cost of one programme, line by line, with the visa proof-of-funds figure.",
      inputSchema: z.object({
        programme_id: z.string(),
        accommodation: z.enum(ACCOMMODATION_TYPES).optional(),
      }),
      execute: async ({ programme_id, accommodation }) => costBreakdown(programme_id, accommodation, ctx),
    }),
    find_scholarships: tool({
      description: "Open scholarships this student is eligible for, optionally for one country.",
      inputSchema: z.object({ country: country.optional() }),
      execute: async (input) => scholarshipSearch(input.country, ctx),
    }),
    get_visa_rules: tool({
      description:
        "Published visa rules for a country, and whether a nationality is restricted there. Quote the ngn and local amounts as given.",
      inputSchema: z.object({
        country,
        nationality: z.string().length(2).optional().describe("2-letter code; defaults to the student's"),
      }),
      execute: async (input) => visaRules(input.country, input.nationality, ctx),
    }),
    compare_programmes: tool({
      description: "Compare up to 3 programmes side by side.",
      inputSchema: z.object({ ids: z.array(z.string()).min(2).max(3) }),
      execute: async ({ ids }) => comparison(ids, ctx),
    }),
    add_to_shortlist: tool({
      description: "Save a programme to the student's shortlist.",
      inputSchema: z.object({ programme_id: z.string() }),
      execute: async ({ programme_id }) => {
        const bundle = find(programme_id, ctx)
        if (!bundle) return notFound
        const result = await ctx.addToShortlist(programme_id)
        return { result, programmes: [programmeCard(bundle, ctx)], sources: [sourceOf(programmeCard(bundle, ctx))] }
      },
    }),
  }
}
