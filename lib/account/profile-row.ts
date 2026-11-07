import { z } from "zod"

import type { Tables, TablesInsert } from "@/lib/db/database.types"
import { toMatchProfile } from "@/lib/match/draft"
import { nextCycle } from "@/lib/match/labels"
import { completeness, emptyDraft, type Draft } from "@/lib/match/profile-store"
import { DEFAULT_WEIGHTS, matchProfile, type MatchProfile } from "@/lib/match/types"

const testAnswer = z.object({ state: z.enum(["", "taken", "planned", "not_taking"]), score: z.string().max(10) })
const short = z.string().max(200)

/** The wizard's answers as they cross the API. */
export const draftSchema = z.object({
  step: z.number().int().min(0).max(5),
  nationality: short,
  residence: short,
  travel_document: short,
  degree_title: short,
  institution_type: short,
  degree_class: short,
  cgpa: short,
  cgpa_scale: short,
  hnd_pgd: z.boolean(),
  professional_registration: short,
  field: short,
  graduation_year: short,
  work_years: short,
  tests: z.object({
    ielts: testAnswer,
    toefl: testAnswer,
    duolingo: testAnswer,
    pte: testAnswer,
    gre: testAnswer,
    gmat: testAnswer,
  }),
  toefl_scale: z.enum(["0-120", "1-6"]),
  english_medium_degree: z.boolean(),
  waec_english_grade: short,
  budget_millions: short,
  budget_unknown: z.boolean(),
  tuition_cap_millions: short,
  funding_source: short,
  countries: z.array(z.string().max(2)).max(3),
  cities: short,
  campus_or_city: short,
  accommodation: short,
  target_cycle: short,
  target_term: short,
  career_goal: short,
  post_study_work: short,
  dependants: short,
}) satisfies z.ZodType<Draft>

const oneOf = <T extends string>(value: string, allowed: readonly T[]) =>
  (allowed as readonly string[]).includes(value) ? (value as T) : null
const number = (value: string) => (value.trim() === "" || Number.isNaN(Number(value)) ? null : Number(value))
const year = (value: string) => {
  const parsed = number(value)
  return parsed !== null && parsed >= 1950 && parsed <= 2100 ? parsed : null
}
const countryCode = (value: string) => (/^[A-Z]{2}$/.test(value) ? value : null)

/** An untouched draft holds nothing worth overwriting a saved profile with. */
export const hasAnswers = (draft: Draft) =>
  JSON.stringify({ ...draft, step: 0 }) !== JSON.stringify({ ...emptyDraft, step: 0 })

/** Wizard answers as student_profile columns; the raw answers go in wizard_answers so it can reopen. */
export function draftToRow(draft: Draft, now: Date): Omit<TablesInsert<"student_profile">, "user_id"> {
  const p = toMatchProfile(draft, now)
  const millions = number(draft.tuition_cap_millions)
  return {
    nationality: p.nationality,
    residence_country: countryCode(draft.residence),
    travel_document: p.travel_document,
    degree_title: draft.degree_title || null,
    institution_type: oneOf(draft.institution_type, ["federal", "state", "private", "polytechnic"]),
    degree_class: oneOf(draft.degree_class, ["first", "upper_second", "lower_second", "third", "pass"] as const),
    cgpa: p.cgpa,
    cgpa_scale: p.cgpa_scale,
    hnd_pgd: p.hnd_pgd,
    professional_registration: p.professional_registration,
    field: p.field,
    graduation_year: year(draft.graduation_year),
    work_years: p.work_years,
    ielts: p.ielts,
    toefl: p.toefl,
    toefl_scale: p.toefl_scale,
    duolingo: p.duolingo,
    pte: p.pte,
    gre: p.gre,
    gmat: p.gmat,
    tests_planned: p.tests_planned,
    english_medium_degree: p.english_medium_degree,
    waec_english_grade: p.waec_english_grade,
    budget_total_minor: p.budget_total_minor,
    tuition_cap_minor: millions === null ? null : Math.round(millions * 1_000_000) * 100,
    funding_source: oneOf(draft.funding_source, ["self", "sponsor", "scholarship", "loan", "mixed"]),
    target_cycle: p.target_cycle,
    target_term: p.target_term,
    preferred_countries: p.preferred_countries,
    preferred_cities: p.preferred_cities,
    accommodation_pref: p.accommodation_pref,
    dependants: p.dependants,
    career_goal: draft.career_goal || null,
    post_study_work: p.post_study_work,
    campus_or_city: oneOf(draft.campus_or_city, ["campus", "city", "either"]),
    completeness: completeness(draft),
    wizard_answers: draft,
  }
}

/** What matching needs from a stored profile. Anything invalid falls back to the defaults. */
export function rowToProfile(row: Tables<"student_profile">, now: Date): MatchProfile {
  const weights = row.weights as MatchProfile["weights"] | null
  return matchProfile.parse({
    nationality: row.nationality,
    travel_document: row.travel_document,
    degree_class: row.degree_class,
    cgpa: row.cgpa,
    cgpa_scale: row.cgpa === null ? null : row.cgpa_scale,
    hnd_pgd: row.hnd_pgd,
    professional_registration: row.professional_registration,
    field: row.field,
    include_related_fields: row.include_related_fields,
    work_years: row.work_years,
    ielts: row.ielts,
    toefl: row.toefl_scale ? row.toefl : null,
    toefl_scale: row.toefl_scale,
    duolingo: row.duolingo,
    pte: row.pte,
    gre: row.gre,
    gmat: row.gmat,
    tests_planned: row.tests_planned,
    english_medium_degree: row.english_medium_degree,
    waec_english_grade: row.waec_english_grade,
    budget_total_minor: row.budget_total_minor,
    target_cycle: row.target_cycle ?? nextCycle(now),
    target_term: row.target_term,
    preferred_countries: row.preferred_countries,
    preferred_cities: row.preferred_cities,
    accommodation_pref: row.accommodation_pref,
    dependants: row.dependants,
    post_study_work: row.post_study_work,
    weights: weights ?? DEFAULT_WEIGHTS,
  })
}
