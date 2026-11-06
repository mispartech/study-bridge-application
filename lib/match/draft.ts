import { nextCycle } from "./labels"
import { DEFAULT_BUDGET_MILLIONS, type Draft, type TestKey } from "./profile-store"
import { matchProfile, type MatchProfile } from "./types"

export * from "./profile-store"

const number = (value: string) => (value.trim() === "" || Number.isNaN(Number(value)) ? null : Number(value))

export function toMatchProfile(draft: Draft, now: Date): MatchProfile {
  const held = (key: TestKey) => (draft.tests[key].state === "taken" ? number(draft.tests[key].score) : null)
  const millions = draft.budget_unknown ? DEFAULT_BUDGET_MILLIONS : number(draft.budget_millions)
  const toefl = held("toefl")
  const cgpa = number(draft.cgpa)
  return matchProfile.parse({
    nationality: draft.nationality || null,
    travel_document: draft.travel_document || null,
    degree_class: draft.degree_class || null,
    cgpa,
    cgpa_scale: cgpa === null ? null : Number(draft.cgpa_scale),
    hnd_pgd: draft.hnd_pgd,
    field: draft.field || null,
    work_years: number(draft.work_years) ?? 0,
    ielts: held("ielts"),
    toefl,
    toefl_scale: toefl === null ? null : draft.toefl_scale,
    duolingo: held("duolingo"),
    pte: held("pte"),
    gre: held("gre"),
    gmat: held("gmat"),
    tests_planned: (Object.keys(draft.tests) as TestKey[]).filter((k) => draft.tests[k].state === "planned"),
    english_medium_degree: draft.english_medium_degree,
    waec_english_grade: draft.waec_english_grade || null,
    budget_total_minor: millions === null ? null : Math.round(millions * 1_000_000) * 100,
    target_cycle: draft.target_cycle || nextCycle(now),
    target_term: draft.target_term || null,
    preferred_countries: draft.countries,
    preferred_cities: draft.cities
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean),
    accommodation_pref: draft.accommodation || null,
    dependants: number(draft.dependants) ?? 0,
    post_study_work: draft.post_study_work || null,
  })
}

export function parseProfileCookie(value: string | undefined): MatchProfile | null {
  if (!value) return null
  try {
    const parsed = matchProfile.safeParse(JSON.parse(decodeURIComponent(value)))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}
