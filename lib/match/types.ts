import { z } from "zod"

import type { Tables } from "@/lib/db/database.types"

export const BANDS = ["pass", "third", "lower_second", "upper_second", "first"] as const
export type Band = (typeof BANDS)[number]

export const TERM_FIRST_MONTH = { fall: 8, winter: 1, spring: 3, summer: 6 } as const
export type Term = keyof typeof TERM_FIRST_MONTH

export const DEFAULT_WEIGHTS = { A: 30, B: 25, C: 15, L: 10, S: 10, O: 10 }

const weights = z
  .object({
    A: z.number().min(0),
    B: z.number().min(0),
    C: z.number().min(0),
    L: z.number().min(0),
    S: z.number().min(0),
    O: z.number().min(0),
  })
  .refine((w) => Object.values(w).reduce((a, b) => a + b, 0) === 100, "Weights must sum to 100")

const score = (min: number, max: number) => z.number().min(min).max(max).nullable().default(null)

/** The profile matching needs. Quick match sends part of it, so everything optional has a default. */
export const matchProfile = z
  .object({
    nationality: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable()
      .default(null),
    travel_document: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable()
      .default(null),
    degree_class: z.enum(BANDS).nullable().default(null),
    cgpa: score(0, 5),
    cgpa_scale: z
      .union([z.literal(4), z.literal(5)])
      .nullable()
      .default(null),
    hnd_pgd: z.boolean().default(false),
    field: z
      .enum(["computer_data_science", "public_health", "business_finance", "engineering", "project_management", "law"])
      .nullable()
      .default(null),
    work_years: z.number().min(0).default(0),
    ielts: score(0, 9),
    toefl: score(0, 120),
    toefl_scale: z.enum(["0-120", "1-6"]).nullable().default(null),
    duolingo: score(10, 160),
    pte: score(10, 90),
    gre: score(260, 340),
    gmat: score(200, 805),
    tests_planned: z.array(z.enum(["ielts", "toefl", "duolingo", "pte", "gre", "gmat"])).default([]),
    english_medium_degree: z.boolean().default(false),
    waec_english_grade: z.enum(["A1", "B2", "B3", "C4", "C5", "C6", "D7", "E8", "F9"]).nullable().default(null),
    /** Whole budget in NGN minor units (kobo). Null = "I don't know yet". */
    budget_total_minor: z.number().int().nonnegative().nullable().default(null),
    target_cycle: z.string().regex(/^\d{4}\/\d{2}$/),
    target_term: z.enum(["fall", "winter", "spring", "summer"]).nullable().default(null),
    preferred_countries: z.array(z.enum(["UK", "CA", "US"])).default([]),
    preferred_cities: z.array(z.string()).default([]),
    accommodation_pref: z
      .enum(["university_halls", "private_studio", "shared_flat", "homestay", "off_campus_shared"])
      .nullable()
      .default(null),
    dependants: z.number().int().min(0).default(0),
    weights: weights.default(DEFAULT_WEIGHTS),
  })
  .refine((p) => p.toefl === null || p.toefl_scale !== null, "toefl_scale is required with a TOEFL score")
  .refine((p) => p.cgpa === null || (p.cgpa_scale !== null && p.cgpa <= p.cgpa_scale), "cgpa needs a scale it fits")

export type MatchProfile = z.output<typeof matchProfile>

export type Catalogue = {
  universities: Tables<"university">[]
  programmes: Tables<"programme">[]
  requirements: Tables<"requirement">[]
  intakes: Tables<"intake">[]
  fees: Tables<"fee">[]
  cityCosts: Tables<"city_cost">[]
  scholarships: Tables<"scholarship">[]
  visaRules: Tables<"visa_rule">[]
  gradeMappings: Tables<"grade_mapping">[]
  fxRates: Tables<"fx_rate">[]
  costEstimates: Tables<"cost_estimate">[]
}

export type MatchOptions = { now: Date; demoMode: boolean }

export type Academics = {
  band: Band | null
  gpa4: number | null
  percent: number | null
  source: "stated" | "estimated"
}

export type CostLine = {
  key: "tuition" | "rent" | "living" | "visa_health" | "application_fee" | "deposit" | "flights"
  label: string
  amount_minor: bigint
  currency: string
  source_url: string
}

export type Affordability = "within" | "stretch" | "out_of_reach" | "unknown"

export type Cost = {
  currency: string
  lines: CostLine[]
  total_minor: bigint
  /** NGN minor units at each rate kind. Budget checks use market: it is what students actually pay. */
  total_ngn: { official: bigint; market: bigint }
  proof_of_funds_minor: bigint | null
  accommodation: string
  accommodation_available: boolean
  affordability: Affordability
}

export type Bundle = {
  programme: Tables<"programme">
  university: Tables<"university">
  requirement: Tables<"requirement"> | undefined
  fee: Tables<"fee"> | undefined
  intakes: Tables<"intake">[]
}

export type ScoreBreakdown = { A: number; B: number; C: number; L: number; S: number; O: number; fit: number }

export type Group = "strong" | "good" | "reach"

export type MatchFlag =
  | "check_test_requirement"
  | "check_english_requirement"
  | "planned_test_counted"
  | "grades_estimated"
  | "older_fee_year"

export type RankedProgramme = {
  bundle: Bundle
  scores: ScoreBreakdown
  group: Group
  reach: boolean
  cost: Cost
  intake: Tables<"intake">
  next_deadline: { label: string; date: string }
  flags: MatchFlag[]
}

export type RestrictedProgramme = { bundle: Bundle; reason: string; source_url: string; review_due: string | null }
export type NeedsEnglishProgramme = { bundle: Bundle; tests_planned: string[]; cost: Cost | null }
export type ExcludedProgramme = { programme_id: string; title: string; filter: string; reason: string }

export type MatchResult = {
  academics: Academics
  /** The top 20 after the diversity caps. */
  ranked: RankedProgramme[]
  /** Everything else that passed, including programmes held back by the caps. */
  more: RankedProgramme[]
  restricted: RestrictedProgramme[]
  needs_english: NeedsEnglishProgramme[]
  excluded: ExcludedProgramme[]
}
