// Zod schemas for every table (Row shapes as returned by Supabase), plus Insert schemas for the
// tables clients write to. Enum values come from the generated types so they cannot drift;
// lib/db/schemas.test.ts checks every schema against Database at compile time.

import { z } from "zod"

import { Constants, type Database, type Json } from "./database.types"

const E = Constants.public.Enums
export const confidenceLevel = z.enum(E.confidence_level)
export const countryCode = z.enum(E.country_code)
export const degreeType = z.enum(E.degree_type)
export const studyMode = z.enum(E.study_mode)
export const ukClassBand = z.enum(E.uk_class_band)
export const accommodationType = z.enum(E.accommodation_type)
export const trackerStage = z.enum(E.tracker_stage)
export const visaRuleType = z.enum(E.visa_rule_type)
export const fieldCode = z.enum(E.field_code)

export const currencyCode = z.enum(["NGN", "GBP", "CAD", "USD"])
export const isoCountry = z.string().regex(/^[A-Z]{2}$/)
const uuid = z.uuid()
const timestamp = z.string() // timestamptz as returned by PostgREST (ISO 8601)
const date = z.iso.date()
const url = z.url({ protocol: /^https$/ })
/** Integer amount in minor units (kobo, pence, cents). */
const minor = z.number().int().nonnegative()
/** Any non-null JSON value (jsonb not null). Use `.nullable()` for nullable columns. */
const json = z.custom<NonNullable<Json>>((v) => v !== null && z.json().safeParse(v).success, "Expected JSON")

const timestamps = { created_at: timestamp, updated_at: timestamp }
/** Provenance carried by every content row. */
const content = {
  source_url: z.string().min(1),
  last_verified_at: timestamp,
  confidence: confidenceLevel,
  is_demo: z.boolean(),
}

export const fitWeights = z.object({
  A: z.number().min(0),
  B: z.number().min(0),
  C: z.number().min(0),
  L: z.number().min(0),
  S: z.number().min(0),
  O: z.number().min(0),
})

// --- Student data ----------------------------------------------------------------

export const studentProfileRow = z.object({
  id: uuid,
  user_id: uuid,
  nationality: isoCountry.nullable(),
  residence_country: isoCountry.nullable(),
  /** Issuer of a non-passport travel document (e.g. PS); matched by visa rules. */
  travel_document: isoCountry.nullable(),
  tests_planned: z.array(z.enum(["ielts", "toefl", "duolingo", "pte", "gre", "gmat"])),
  toefl_scale: z.enum(["0-120", "1-6"]).nullable(),
  pte: z.number().min(10).max(90).nullable(),
  waec_english_grade: z.enum(["A1", "B2", "B3", "C4", "C5", "C6", "D7", "E8", "F9"]).nullable(),
  hnd_pgd: z.boolean(),
  target_cycle: z
    .string()
    .regex(/^\d{4}\/\d{2}$/)
    .nullable(),
  target_term: z.enum(["fall", "winter", "spring", "summer"]).nullable(),
  degree_title: z.string().nullable(),
  institution_type: z.enum(["federal", "state", "private", "polytechnic"]).nullable(),
  degree_class: ukClassBand.nullable(),
  cgpa: z.number().min(0).max(5).nullable(),
  cgpa_scale: z.union([z.literal(4), z.literal(5)]).nullable(),
  field: fieldCode.nullable(),
  graduation_year: z.number().int().min(1950).max(2100).nullable(),
  work_years: z.number().min(0),
  ielts: z.number().min(0).max(9).nullable(),
  toefl: z.number().min(0).max(120).nullable(),
  duolingo: z.number().min(10).max(160).nullable(),
  gre: z.number().min(260).max(340).nullable(),
  gmat: z.number().min(200).max(805).nullable(),
  english_medium_degree: z.boolean(),
  budget_total_minor: minor.nullable(),
  tuition_cap_minor: minor.nullable(),
  funding_source: z.enum(["self", "sponsor", "scholarship", "loan", "mixed"]).nullable(),
  intake_target: date.nullable(),
  preferred_countries: z.array(countryCode),
  preferred_cities: z.array(z.string()),
  accommodation_pref: accommodationType.nullable(),
  dependants: z.number().int().min(0),
  career_goal: z.string().nullable(),
  weights: fitWeights,
  completeness: z.number().int().min(0).max(100),
  ...timestamps,
})

/** What a signed-in student may send: server-owned fields are omitted, the rest optional. */
export const studentProfileInsert = studentProfileRow
  .omit({ id: true, user_id: true, created_at: true, updated_at: true })
  .partial()
  .refine((p) => p.cgpa == null || (p.cgpa_scale != null && p.cgpa <= p.cgpa_scale), {
    message: "cgpa needs a cgpa_scale and must not exceed it",
    path: ["cgpa"],
  })
export const studentProfileUpdate = studentProfileInsert

export const shortlistRow = z.object({ id: uuid, student_id: uuid, programme_id: uuid, ...timestamps })
export const shortlistInsert = z.object({ programme_id: uuid })

export const checklistItem = z.object({ label: z.string().min(1), done: z.boolean() })
export const applicationTrackerRow = z.object({
  id: uuid,
  student_id: uuid,
  programme_id: uuid,
  stage: trackerStage,
  checklist: z.array(checklistItem),
  next_reminder_at: timestamp.nullable(),
  notes: z.string().nullable(),
  ...timestamps,
})
export const applicationTrackerInsert = applicationTrackerRow
  .pick({ programme_id: true, stage: true, checklist: true, next_reminder_at: true, notes: true })
  .partial({ stage: true, checklist: true, next_reminder_at: true, notes: true })

// --- Content ---------------------------------------------------------------------

export const universityRow = z.object({
  id: uuid,
  name: z.string().min(1),
  country: countryCode,
  city: z.string().min(1),
  region: z.string().min(1),
  is_public: z.boolean(),
  dli_number: z.string().nullable(),
  sponsor_licence: z.boolean(),
  sevp_certified: z.boolean(),
  ranking_band: z.string().nullable(),
  intl_office_url: z.string(),
  official_domains: z.array(z.string().min(1)).min(1),
  ...content,
  ...timestamps,
})

export const programmeRow = z.object({
  id: uuid,
  university_id: uuid,
  title: z.string().min(1),
  degree_type: degreeType,
  field: fieldCode,
  duration_months: z.number().int().min(1).max(60),
  study_mode: studyMode,
  stem_designated: z.boolean(),
  has_coop_or_placement: z.boolean(),
  description: z.string(),
  /** pgvector serialises as "[0.1,0.2,…]"; usually not selected by clients. */
  embedding: z.string().nullable(),
  programme_url: z.string(),
  apply_url: url,
  ...content,
  ...timestamps,
})

const testStatus = z.enum(["required", "one_of_required", "optional", "not_required"])

export const requirementRow = z.object({
  programme_id: uuid,
  min_uk_class: ukClassBand,
  min_gpa4: z.number().min(0).max(4).nullable(),
  nigeria_rule: z.string().nullable(),
  considers_lower_with_experience: z.boolean(),
  ielts_min: z.number().min(0).max(9).nullable(),
  toefl_min: z.number().min(0).max(120).nullable(),
  toefl_entries: z.array(
    z.object({
      scale: z.enum(["0-120", "1-6"]),
      overall_min: z.number(),
      subscore_min: z.number().nullable(),
    })
  ),
  duolingo_min: z.number().min(10).max(160).nullable(),
  english_subscores: json.nullable(),
  english_waiver_text: z.string().nullable(),
  waec_english_accepted: z.boolean(),
  pte_min: z.number().min(10).max(90).nullable(),
  gre_status: testStatus.nullable(),
  gmat_status: testStatus.nullable(),
  min_work_years: z.number().min(0),
  documents: z.array(z.string()),
  ...content,
  ...timestamps,
})

export const intakeDeadline = z.object({ label: z.string().min(1), date })
export const intakeRow = z.object({
  id: uuid,
  programme_id: uuid,
  start_term: z.enum(["fall", "winter", "spring", "summer"]),
  cycle: z.string().regex(/^\d{4}\/\d{2}$/),
  start_month: date.nullable(),
  application_opens: date.nullable(),
  deadlines: z.array(intakeDeadline),
  scholarship_deadline: date.nullable(),
  deposit_minor: minor.nullable(),
  deposit_credited_to_tuition: z.boolean(),
  deposit_currency: currencyCode.nullable(),
  deposit_deadline: date.nullable(),
  ...content,
  ...timestamps,
})

export const feeRow = z.object({
  id: uuid,
  programme_id: uuid,
  fee_year: z.string().regex(/^\d{4}\/\d{2}$/),
  tuition_per_year_minor: minor,
  application_fee_minor: minor,
  currency: currencyCode,
  ...content,
  ...timestamps,
})

export const cityCostRow = z.object({
  id: uuid,
  country: countryCode,
  city: z.string().min(1),
  accommodation_type: accommodationType,
  rent_monthly_low_minor: minor,
  rent_monthly_high_minor: minor,
  living_monthly_minor: minor,
  currency: currencyCode,
  ...content,
  ...timestamps,
})

export const scholarshipRow = z.object({
  id: uuid,
  name: z.string().min(1),
  funder: z.string().min(1),
  countries: z.array(countryCode),
  fields: z.array(fieldCode),
  eligible_nationalities: z.array(isoCountry),
  min_uk_class: ukClassBand.nullable(),
  amount_minor: minor.nullable(),
  currency: currencyCode.nullable(),
  coverage: z.enum(["full", "tuition", "partial", "stipend"]),
  deadline: date.nullable(),
  url: z.string(),
  ...content,
  ...timestamps,
})

export const visaRuleRow = z.object({
  id: uuid,
  country: countryCode,
  rule_type: visaRuleType,
  applies_to_nationalities: z.array(isoCountry),
  applies_to_travel_documents: z.array(isoCountry),
  applies_to_region: z.string().nullable(),
  value: json,
  description: z.string().min(1),
  effective_from: date,
  effective_to: date.nullable(),
  review_due: date.nullable(),
  ...content,
  ...timestamps,
})

export const gradeMappingRow = z.object({
  id: uuid,
  scale: z.union([z.literal(4), z.literal(5)]),
  cgpa_min: z.number().min(0),
  cgpa_max: z.number().min(0),
  uk_class: ukClassBand,
  gpa4_estimate: z.number().min(0).max(4),
  percent_estimate: z.number().int().min(0).max(100),
  ...content,
  ...timestamps,
})

export const fxRateRow = z.object({
  id: uuid,
  base: currencyCode,
  quote: currencyCode,
  rate: z.number().positive(),
  rate_kind: z.enum(["official", "market"]),
  fetched_at: timestamp,
  source_url: z.string().nullable(),
  is_demo: z.boolean(),
  ...timestamps,
})

export const costEstimateRow = z.object({
  id: uuid,
  country: countryCode,
  item: z.enum(["flights", "health_cover"]),
  amount_minor: minor,
  currency: currencyCode,
  per_year: z.boolean(),
  ...content,
  ...timestamps,
})

// --- Ingestion bookkeeping (server only) -------------------------------------------

export const sourceAuditRow = z.object({
  id: uuid,
  table_name: z.string().min(1),
  record_id: uuid.nullable(),
  source_url: z.string().min(1),
  fetched_at: timestamp,
  content_hash: z.string().nullable(),
  change_detected: z.boolean(),
  diff: json.nullable(),
  verified_by: z.string().nullable(),
  approved_at: timestamp.nullable(),
  ...timestamps,
})

export const reviewQueueRow = z.object({
  id: uuid,
  table_name: z.string().min(1),
  record_id: uuid.nullable(),
  proposed: json,
  current: json.nullable(),
  reason: z.string().min(1),
  status: z.enum(["pending", "approved", "rejected"]),
  ...timestamps,
})

// --- AI usage, plans and caches (server only) ----------------------------------------

export const planTier = z.enum(E.plan_tier)

export const aiUsageRow = z.object({
  id: uuid,
  task: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  input_tokens: z.number().int().nonnegative().nullable(),
  output_tokens: z.number().int().nonnegative().nullable(),
  latency_ms: z.number().int().nonnegative(),
  success: z.boolean(),
  error: z.string().nullable(),
  user_id: uuid.nullable(),
  created_at: timestamp,
})

export const subscriptionRow = z.object({
  user_id: uuid,
  plan: planTier,
  current_period_end: timestamp.nullable(),
  ...timestamps,
})

export const advisorDailyUsageRow = z.object({
  user_id: uuid,
  day: date,
  messages: z.number().int().nonnegative(),
})

export const explanationCacheRow = z.object({
  programme_id: uuid,
  profile_bucket: z.string().min(1),
  source_version: z.string().min(1),
  content: z.string(),
  provider: z.string().min(1),
  model: z.string().min(1),
  ...timestamps,
})

export const rowSchemas = {
  student_profile: studentProfileRow,
  shortlist: shortlistRow,
  application_tracker: applicationTrackerRow,
  university: universityRow,
  programme: programmeRow,
  requirement: requirementRow,
  intake: intakeRow,
  fee: feeRow,
  city_cost: cityCostRow,
  scholarship: scholarshipRow,
  visa_rule: visaRuleRow,
  grade_mapping: gradeMappingRow,
  fx_rate: fxRateRow,
  cost_estimate: costEstimateRow,
  source_audit: sourceAuditRow,
  review_queue: reviewQueueRow,
  ai_usage: aiUsageRow,
  subscription: subscriptionRow,
  advisor_daily_usage: advisorDailyUsageRow,
  explanation_cache: explanationCacheRow,
} as const

export type TableName = keyof Database["public"]["Tables"]
