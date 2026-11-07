"use client"

import { useRouter } from "next/navigation"
import * as React from "react"

import { track } from "@/lib/analytics/track"
import { CountryChips } from "@/components/match/country-chips"
import type { CountryCode } from "@/lib/match/countries"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ProgressRing } from "@/components/ui/progress-ring"
import {
  clearBrowserProfile,
  completeness,
  DEFAULT_BUDGET_MILLIONS,
  draftStore,
  emptyDraft,
  hasSession,
  saveProfile,
  savedStore,
  toMatchProfile,
  type Draft,
  type TestKey,
  type TestState,
} from "@/lib/match/draft"
import { ACCOMMODATION_LABEL, BAND_LABEL, FIELDS, nextCycle, TERM_LABEL } from "@/lib/match/labels"
import { cn } from "@/lib/utils"

const control = "h-11 w-full rounded-button border border-border bg-surface px-3 text-[0.9375rem]"

const STEPS = [
  { title: "Who you are", hint: "This decides which visas are open to you." },
  { title: "Your academics", hint: "A rough answer is fine. You can change it later." },
  { title: "Your tests", hint: "Not taken one yet? Mark it planned and we'll still show you options." },
  { title: "Your budget", hint: "Count savings and sponsors. We'll work in naira." },
  { title: "Your preferences", hint: "Where you'd like to be and when you'd like to start." },
  { title: "Your goals", hint: "Last step. This shapes your career score." },
]

const TESTS: { key: TestKey; label: string }[] = [
  { key: "ielts", label: "IELTS" },
  { key: "toefl", label: "TOEFL" },
  { key: "duolingo", label: "Duolingo" },
  { key: "pte", label: "PTE" },
  { key: "gre", label: "GRE" },
  { key: "gmat", label: "GMAT" },
]

const TEST_STATES: { value: TestState; label: string }[] = [
  { value: "taken", label: "Taken" },
  { value: "planned", label: "Planned" },
  { value: "not_taking", label: "Not taking" },
]

const WAEC_GRADES = ["A1", "B2", "B3", "C4", "C5", "C6", "D7", "E8", "F9"]

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      {children}
    </label>
  )
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-button border px-3 text-sm font-medium",
        active ? "border-primary bg-primary-tint text-primary-strong" : "border-border bg-surface text-ink"
      )}
    >
      {children}
    </button>
  )
}

function Options({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: Record<string, string>
}) {
  return (
    <select className={control} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose one</option>
      {Object.entries(options).map(([key, label]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </select>
  )
}

const noSubscription = () => () => undefined

export function Wizard() {
  const router = useRouter()
  // Each script fetched on the last tap costs a full round trip on a slow network, so load the route now.
  React.useEffect(() => router.prefetch("/discover"), [router])
  const draft = React.useSyncExternalStore(draftStore.subscribe, draftStore.get, draftStore.getServer)
  // Every answer saves as it's typed, so progress survives a refresh or a dropped connection.
  const update = (patch: Partial<Draft>) => draftStore.set({ ...draftStore.get(), ...patch })
  const text = (key: keyof Draft) => ({
    value: draft[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => update({ [key]: e.target.value }),
  })
  const step = draft.step
  // The page is prerendered, so the date is only read in the browser.
  const cycleList = React.useSyncExternalStore(
    noSubscription,
    () => `${nextCycle(new Date())},${nextCycle(new Date(), 1)}`,
    () => ""
  )
  const cycles = Object.fromEntries(
    cycleList
      .split(",")
      .filter(Boolean)
      .map((cycle) => [cycle, cycle])
  )

  // Reopening on a signed-in device brings the saved answers back.
  React.useEffect(() => {
    if (!hasSession() || draftStore.get() !== emptyDraft) return
    void fetch("/api/account/profile")
      .then((res) => (res.ok ? (res.json() as Promise<{ draft: Partial<Draft> | null }>) : null))
      .then((body) => {
        if (body?.draft) draftStore.set({ ...emptyDraft, ...body.draft, step: 0 })
      })
  }, [])

  function advance() {
    track(`onboarding_step_${step + 1}`)
    update({ step: step + 1 })
  }

  async function finish() {
    track(`onboarding_step_${step + 1}`)
    saveProfile(toMatchProfile(draft, new Date()), completeness(draft))
    if (!hasSession()) {
      router.push("/sign-in?reason=wizard&next=/discover")
      return
    }
    const res = await fetch("/api/account/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accepted: false, draft, saved: savedStore.get() }),
    })
    if (res.status === 403) router.push("/consent?next=/discover")
    else {
      if (res.ok) clearBrowserProfile()
      router.push("/discover")
    }
  }

  const steps = [
    <>
      <Field label="Nationality (2-letter code, e.g. NG)">
        <input className={control} maxLength={2} autoCapitalize="characters" {...text("nationality")} />
      </Field>
      <Field label="Country you live in">
        <input className={control} maxLength={2} autoCapitalize="characters" {...text("residence")} />
      </Field>
      <Field label="Passport or travel document country">
        <input className={control} maxLength={2} autoCapitalize="characters" {...text("travel_document")} />
      </Field>
    </>,
    <>
      <Field label="Degree title">
        <input className={control} {...text("degree_title")} />
      </Field>
      <Field label="Institution type">
        <Options
          value={draft.institution_type}
          onChange={(institution_type) => update({ institution_type })}
          options={{ federal: "Federal", state: "State", private: "Private", polytechnic: "Polytechnic" }}
        />
      </Field>
      <Field label="Degree class">
        <Options
          value={draft.degree_class}
          onChange={(degree_class) => update({ degree_class })}
          options={BAND_LABEL}
        />
      </Field>
      <div className="grid grid-cols-[1fr_6rem] gap-2">
        <Field label="CGPA">
          <input className={control} inputMode="decimal" {...text("cgpa")} />
        </Field>
        <Field label="Out of">
          <select className={control} value={draft.cgpa_scale} onChange={(e) => update({ cgpa_scale: e.target.value })}>
            <option value="5">5.0</option>
            <option value="4">4.0</option>
          </select>
        </Field>
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-5 accent-primary"
          checked={draft.hnd_pgd}
          onChange={(e) => update({ hnd_pgd: e.target.checked })}
        />
        I have an HND plus PGD
      </label>
      <Field label="Professional registration">
        <Options
          value={draft.professional_registration || "none"}
          onChange={(professional_registration) => update({ professional_registration })}
          options={{ none: "None", nurse: "Registered nurse", other: "Another health or care registration" }}
        />
      </Field>
      <Field label="Field you want to study">
        <Options
          value={draft.field}
          onChange={(field) => update({ field })}
          options={Object.fromEntries(FIELDS.map((f) => [f.value, f.label]))}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Graduation year">
          <input className={control} inputMode="numeric" {...text("graduation_year")} />
        </Field>
        <Field label="Years of work">
          <input className={control} inputMode="decimal" {...text("work_years")} />
        </Field>
      </div>
    </>,
    <>
      {TESTS.map(({ key, label }) => {
        const answer = draft.tests[key]
        const setTest = (patch: Partial<typeof answer>) =>
          update({ tests: { ...draft.tests, [key]: { ...answer, ...patch } } })
        return (
          <fieldset key={key} className="flex flex-col gap-1">
            <legend className="text-sm font-medium">{label}</legend>
            <div className="grid grid-cols-3 gap-1">
              {TEST_STATES.map((s) => (
                <Choice key={s.value} active={answer.state === s.value} onClick={() => setTest({ state: s.value })}>
                  {s.label}
                </Choice>
              ))}
            </div>
            {answer.state === "taken" && (
              <div className="mt-1 flex gap-2">
                <input
                  aria-label={`${label} score`}
                  placeholder="Score"
                  inputMode="decimal"
                  className={control}
                  value={answer.score}
                  onChange={(e) => setTest({ score: e.target.value })}
                />
                {key === "toefl" && (
                  <select
                    aria-label="TOEFL scale"
                    className={control}
                    value={draft.toefl_scale}
                    onChange={(e) => update({ toefl_scale: e.target.value as Draft["toefl_scale"] })}
                  >
                    <option value="0-120">0-120 scale</option>
                    <option value="1-6">1-6 scale</option>
                  </select>
                )}
              </div>
            )}
          </fieldset>
        )
      })}
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-5 accent-primary"
          checked={draft.english_medium_degree}
          onChange={(e) => update({ english_medium_degree: e.target.checked })}
        />
        My degree was taught in English
      </label>
      <Field label="WAEC or NECO English grade">
        <Options
          value={draft.waec_english_grade}
          onChange={(waec_english_grade) => update({ waec_english_grade })}
          options={Object.fromEntries(WAEC_GRADES.map((g) => [g, g]))}
        />
      </Field>
    </>,
    <>
      <Field label="Total available, in millions of naira">
        <input
          className={control}
          inputMode="numeric"
          disabled={draft.budget_unknown}
          placeholder="e.g. 80"
          {...text("budget_millions")}
        />
      </Field>
      <Choice active={draft.budget_unknown} onClick={() => update({ budget_unknown: !draft.budget_unknown })}>
        I don&apos;t know yet
      </Choice>
      {draft.budget_unknown && (
        <p className="text-sm text-muted-foreground">
          We&apos;ll start from ₦{DEFAULT_BUDGET_MILLIONS}m. You can drag it on your results.
        </p>
      )}
      <Field label="Most you'd spend on tuition, in millions of naira (optional)">
        <input className={control} inputMode="numeric" {...text("tuition_cap_millions")} />
      </Field>
      <Field label="Where the money comes from">
        <Options
          value={draft.funding_source}
          onChange={(funding_source) => update({ funding_source })}
          options={{ self: "Myself", sponsor: "A sponsor", scholarship: "Scholarship", loan: "Loan", mixed: "A mix" }}
        />
      </Field>
    </>,
    <>
      <CountryChips
        selected={draft.countries as CountryCode[]}
        onChange={(countries) => update({ countries })}
        nationality={draft.nationality || null}
        travelDocument={draft.travel_document || null}
      />
      <Field label="Cities or regions you like (comma separated)">
        <input className={control} {...text("cities")} />
      </Field>
      <Field label="Campus or city life">
        <Options
          value={draft.campus_or_city}
          onChange={(campus_or_city) => update({ campus_or_city })}
          options={{ campus: "Campus", city: "City", either: "Either" }}
        />
      </Field>
      <Field label="Where you'd like to live">
        <Options
          value={draft.accommodation}
          onChange={(accommodation) => update({ accommodation })}
          options={ACCOMMODATION_LABEL}
        />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Start in">
          <Options value={draft.target_cycle} onChange={(target_cycle) => update({ target_cycle })} options={cycles} />
        </Field>
        <Field label="Term">
          <Options value={draft.target_term} onChange={(target_term) => update({ target_term })} options={TERM_LABEL} />
        </Field>
      </div>
    </>,
    <>
      <Field label="What job do you want after this?">
        <input className={control} {...text("career_goal")} />
      </Field>
      <Field label="How much does working after study matter?">
        <Options
          value={draft.post_study_work}
          onChange={(post_study_work) => update({ post_study_work })}
          options={{ high: "A lot", medium: "Somewhat", low: "Not much" }}
        />
      </Field>
      <Field label="Dependants coming with you">
        <input className={control} inputMode="numeric" {...text("dependants")} />
      </Field>
    </>,
  ]

  const last = step === STEPS.length - 1

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
      <header className="flex items-center gap-4">
        <ProgressRing
          value={Math.round(((step + 1) / STEPS.length) * 100)}
          size={56}
          strokeWidth={5}
          label={`Step ${step + 1} of ${STEPS.length}`}
        >
          <span className="font-heading text-sm font-bold">
            {step + 1}/{STEPS.length}
          </span>
        </ProgressRing>
        <div>
          <h1 className="text-2xl font-extrabold">{STEPS[step]!.title}</h1>
          <p className="text-sm text-muted-foreground">{STEPS[step]!.hint}</p>
        </div>
      </header>

      <Card className="gap-3" data-testid={`step-${step + 1}`}>
        {steps[step]}
      </Card>

      <div className="flex gap-2">
        {step > 0 && (
          <Button variant="outline" onClick={() => update({ step: step - 1 })}>
            Back
          </Button>
        )}
        <Button className="flex-1" onClick={() => (last ? finish() : advance())}>
          {last ? "See my matches" : "Continue"}
        </Button>
      </div>
      <p className="text-center text-xs text-muted-foreground">Saved on this phone as you go.</p>
    </div>
  )
}
