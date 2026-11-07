import { z } from "zod"

const CONFIDENCE = "university_page"
const CENTS = 100
const MONTHS_IN_YEAR = 12

/** University facts the extractor can't see; they come from official registers. Required to publish. */
const university = z.object({
  name: z.string().min(2),
  country: z.enum(["UK", "CA", "US"]),
  city: z.string().min(1),
  official_domain: z.string().min(3),
  region: z.string().min(1, "University region is missing"),
  is_public: z.boolean("Say whether the university is public"),
  intl_office_url: z.url("International office link is missing"),
  register_url: z.url("Register link is missing"),
  dli_number: z.string().nullish(),
  sponsor_licence: z.boolean().nullish(),
  sevp_certified: z.boolean().nullish(),
})

const englishTest = z.object({
  test: z.string(),
  scale: z.string().nullish(),
  overall_min: z.number(),
})

const record = z.object({
  university,
  programme: z.object({
    title: z.string().min(3),
    degree_type: z.string(),
    field: z.string(),
    duration_months: z.number("Duration is missing").int().min(6).max(36),
    study_mode: z.string().nullish(),
    stem_designated: z.boolean().nullish(),
    has_coop_or_placement: z.boolean().nullish(),
    description: z.string().nullish(),
    programme_url: z.url(),
    apply_url: z.url("Apply link is missing"),
  }),
  requirement: z.object({
    min_uk_class: z.string("Minimum degree class is missing"),
    min_gpa4: z.number().nullish(),
    nigeria_rule: z.string().nullish(),
    considers_lower_with_experience: z.boolean().nullish(),
    english_tests: z.array(englishTest),
    english_waiver_text: z.string().nullish(),
    waec_english_accepted: z.boolean().nullish(),
    waec_min_grade: z.string().nullish(),
    gre_required: z.string().nullish(),
    gmat_required: z.string().nullish(),
    min_work_years: z.number().nullish(),
    documents: z.array(z.string()).nullish(),
  }),
  intakes: z
    .array(
      z.object({
        cycle: z.string(),
        start_term: z.string(),
        start_month: z.string().nullish(),
        application_opens: z.string().nullish(),
        deadlines: z.array(z.object({ label: z.string(), date: z.string() }).loose()),
      })
    )
    .min(1, "At least one intake is needed"),
  fees: z
    .array(
      z.object({
        fee_year: z.string("A fee year is missing"),
        tuition_amount: z.number(),
        currency: z.enum(["GBP", "CAD", "USD"]),
        basis: z.string(),
        application_fee: z.number().nullish(),
      })
    )
    .min(1, "At least one fee is needed"),
  source_urls: z.array(z.url()).min(1),
})

export type ProposedRecord = z.infer<typeof record>

const REQUIREDNESS: Record<string, string> = {
  required: "required",
  optional: "optional",
  recommended: "optional",
  not_required: "not_required",
}

const minor = (amount: number) => Math.round(amount * CENTS)

/** Tuition per year. Anything that needs a human's judgement stops here rather than guessing. */
function yearlyTuition(fee: ProposedRecord["fees"][number], months: number) {
  if (fee.basis === "per_year") return fee.tuition_amount
  if (fee.basis === "total" && months <= MONTHS_IN_YEAR) return fee.tuition_amount
  throw new PublishError(`Fee for ${fee.fee_year} is "${fee.basis}": edit it to a yearly amount before approving`)
}

export class PublishError extends Error {}

/** Turns a reviewed record into database rows, or says exactly what still needs fixing. */
export function toRows(input: unknown) {
  const parsed = record.safeParse(input)
  if (!parsed.success) {
    throw new PublishError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "))
  }
  const r = parsed.data
  const source_url = r.source_urls[0]!
  const stamp = { source_url, confidence: CONFIDENCE }
  const tests = r.requirement.english_tests
  const score = (name: string) => tests.find((t) => t.test === name)?.overall_min ?? null
  return {
    university: {
      name: r.university.name,
      country: r.university.country,
      city: r.university.city,
      region: r.university.region,
      is_public: r.university.is_public,
      dli_number: r.university.dli_number ?? null,
      sponsor_licence: r.university.sponsor_licence ?? false,
      sevp_certified: r.university.sevp_certified ?? false,
      intl_office_url: r.university.intl_office_url,
      official_domains: [r.university.official_domain],
      source_url: r.university.register_url,
      confidence: "official",
    },
    programme: {
      ...r.programme,
      study_mode: r.programme.study_mode ?? "full_time",
      stem_designated: r.programme.stem_designated ?? false,
      has_coop_or_placement: r.programme.has_coop_or_placement ?? false,
      ...stamp,
    },
    requirement: {
      min_uk_class: r.requirement.min_uk_class,
      min_gpa4: r.requirement.min_gpa4 ?? null,
      nigeria_rule: r.requirement.nigeria_rule ?? null,
      considers_lower_with_experience: r.requirement.considers_lower_with_experience ?? false,
      ielts_min: score("IELTS"),
      duolingo_min: score("Duolingo"),
      pte_min: score("PTE"),
      toefl_entries: tests
        .filter((t) => t.test === "TOEFL_iBT")
        .map((t) => ({ scale: t.scale ?? "0-120", min: t.overall_min })),
      english_waiver_text: r.requirement.english_waiver_text ?? null,
      waec_english_accepted: r.requirement.waec_english_accepted ?? false,
      waec_min_grade: r.requirement.waec_min_grade ?? null,
      gre_status: REQUIREDNESS[r.requirement.gre_required ?? ""] ?? null,
      gmat_status: REQUIREDNESS[r.requirement.gmat_required ?? ""] ?? null,
      min_work_years: r.requirement.min_work_years ?? 0,
      documents: r.requirement.documents ?? [],
      ...stamp,
    },
    intakes: r.intakes.map((i) => ({
      cycle: i.cycle,
      start_term: i.start_term,
      start_month: i.start_month ? `${i.start_month}-01` : null,
      application_opens: i.application_opens ?? null,
      deadlines: i.deadlines.map(({ label, date }) => ({ label, date })),
      ...stamp,
    })),
    fees: r.fees.map((f) => ({
      fee_year: f.fee_year,
      tuition_per_year_minor: minor(yearlyTuition(f, r.programme.duration_months)),
      application_fee_minor: minor(f.application_fee ?? 0),
      currency: f.currency,
      ...stamp,
    })),
  }
}
