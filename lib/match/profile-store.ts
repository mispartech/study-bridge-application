// No zod here: this file ships to every student page, so it has to stay small.
import type { MatchProfile } from "./types"

export const PROFILE_COOKIE = "sb-profile"
export const COMPLETENESS_COOKIE = "sb-completeness"
const DRAFT_KEY = "sb-draft"
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365

/** Used when a student picks "I don't know yet" for the budget. A starting point, marked incomplete. */
export const DEFAULT_BUDGET_MILLIONS = 60

export type TestState = "" | "taken" | "planned" | "not_taking"
export type TestKey = "ielts" | "toefl" | "duolingo" | "pte" | "gre" | "gmat"
export type TestAnswer = { state: TestState; score: string }

/** Every wizard answer. Lives in this browser until accounts exist; matching uses `toMatchProfile`. */
export type Draft = {
  step: number
  nationality: string
  residence: string
  travel_document: string
  degree_title: string
  institution_type: string
  degree_class: string
  cgpa: string
  cgpa_scale: string
  hnd_pgd: boolean
  professional_registration: string
  field: string
  graduation_year: string
  work_years: string
  tests: Record<TestKey, TestAnswer>
  toefl_scale: "0-120" | "1-6"
  english_medium_degree: boolean
  waec_english_grade: string
  budget_millions: string
  budget_unknown: boolean
  tuition_cap_millions: string
  funding_source: string
  countries: string[]
  cities: string
  campus_or_city: string
  accommodation: string
  target_cycle: string
  target_term: string
  career_goal: string
  post_study_work: string
  dependants: string
}

const noTest: TestAnswer = { state: "", score: "" }

export const emptyDraft: Draft = {
  step: 0,
  nationality: "NG",
  residence: "NG",
  travel_document: "NG",
  degree_title: "",
  institution_type: "",
  degree_class: "",
  cgpa: "",
  cgpa_scale: "5",
  hnd_pgd: false,
  professional_registration: "",
  field: "",
  graduation_year: "",
  work_years: "",
  tests: { ielts: noTest, toefl: noTest, duolingo: noTest, pte: noTest, gre: noTest, gmat: noTest },
  toefl_scale: "0-120",
  english_medium_degree: false,
  waec_english_grade: "",
  budget_millions: "",
  budget_unknown: false,
  tuition_cap_millions: "",
  funding_source: "",
  countries: [],
  cities: "",
  campus_or_city: "",
  accommodation: "",
  target_cycle: "",
  target_term: "",
  career_goal: "",
  post_study_work: "",
  dependants: "",
}

/** 0-100. Drives the "match confidence" label; "I don't know yet" answers don't count. */
export function completeness(draft: Draft): number {
  const answered = [
    draft.nationality,
    draft.degree_class || draft.cgpa,
    draft.field,
    draft.institution_type,
    draft.graduation_year,
    draft.work_years,
    Object.values(draft.tests).some((t) => t.state !== "") ? "yes" : "",
    Object.values(draft.tests).some((t) => t.state === "taken") ? "yes" : "",
    draft.budget_unknown ? "" : draft.budget_millions,
    draft.funding_source,
    draft.countries.length ? "yes" : "",
    draft.accommodation,
    draft.target_cycle,
    draft.target_term,
    draft.career_goal,
  ]
  return Math.round((answered.filter(Boolean).length / answered.length) * 100)
}

export const matchConfidence = (score: number | null) =>
  score === null ? null : score >= 80 ? "High" : score >= 50 ? "Medium" : "Low"

/** The server renders first results from this cookie, so they arrive with the page on a slow connection. */
export function saveProfile(profile: MatchProfile, completenessScore?: number) {
  const write = (name: string, value: string) => {
    document.cookie = `${name}=${value}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`
  }
  write(PROFILE_COOKIE, encodeURIComponent(JSON.stringify(profile)))
  if (completenessScore !== undefined) write(COMPLETENESS_COOKIE, String(completenessScore))
}

// Draft store: a small external store, so the wizard renders the saved answers after hydration.
let current: Draft | null = null
const listeners = new Set<() => void>()

function readDraft(): Draft {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? { ...emptyDraft, ...(JSON.parse(raw) as Partial<Draft>) } : emptyDraft
  } catch {
    return emptyDraft
  }
}

export const draftStore = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  get: () => (current ??= readDraft()),
  getServer: () => emptyDraft,
  set(next: Draft) {
    current = next
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(next))
    } catch {
      // Private windows can refuse storage; the wizard still works for this visit.
    }
    listeners.forEach((listener) => listener())
  },
}

const SAVED_KEY = "sb-saved"
const NONE_SAVED: string[] = []
let savedList: string[] | null = null
const savedListeners = new Set<() => void>()

/** Programmes saved before signing in. They move to the shortlist table on sign-up. */
export const savedStore = {
  subscribe(listener: () => void) {
    savedListeners.add(listener)
    return () => savedListeners.delete(listener)
  },
  get() {
    if (savedList) return savedList
    try {
      savedList = JSON.parse(localStorage.getItem(SAVED_KEY) ?? "[]") as string[]
    } catch {
      savedList = NONE_SAVED
    }
    return savedList
  },
  getServer: () => NONE_SAVED,
  set(next: string[]) {
    savedList = next
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(next))
    } catch {
      // The button still works for this visit.
    }
    savedListeners.forEach((listener) => listener())
  },
}

/** After sign-up the account holds everything, so nothing personal stays in this browser. */
export function clearBrowserProfile() {
  try {
    localStorage.removeItem(DRAFT_KEY)
    localStorage.removeItem(SAVED_KEY)
  } catch {
    // Nothing was stored, then.
  }
  for (const name of [PROFILE_COOKIE, COMPLETENESS_COOKIE])
    document.cookie = `${name}=; path=/; max-age=0; samesite=lax`
  current = emptyDraft
  savedList = NONE_SAVED
  listeners.forEach((listener) => listener())
  savedListeners.forEach((listener) => listener())
}

/** Supabase's session cookie is readable, so the client can tell without a network call. */
export const hasSession = () => document.cookie.includes("-auth-token")
