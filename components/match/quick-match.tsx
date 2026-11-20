"use client"

import { ArrowRight } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"

import { useTurnstile } from "@/components/account/turnstile"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { FitRing } from "@/components/ui/fit-ring"
import { logActivity } from "@/lib/activity/client"
import { track } from "@/lib/analytics/track"
import { MAX_COUNTRIES, type CountryCode } from "@/lib/match/countries"
import { COUNTRY_LABEL, FIELDS, fieldLabel, nextCycle } from "@/lib/match/labels"
import type { MatchView } from "@/lib/match/present"
import { draftStore } from "@/lib/match/profile-store"
import type { Suggestion } from "@/lib/match/suggest"
import { formatShort } from "@/lib/money"

import { BudgetChip } from "./card-parts"
import { CountryChips } from "./country-chips"

const RESULTS = 3
const QUICK_NATIONALITY = "NG"
const MILLION_KOBO = 100_000_000
const control = "h-11 w-full rounded-button border border-border bg-surface px-3 text-[0.9375rem]"

type QuickView = MatchView & { hidden_by_country?: number; suggestions?: Suggestion[] }
type Search = { field: string; budget: string; countries: CountryCode[] }

const countryList = (codes: readonly string[]) => codes.map((c) => COUNTRY_LABEL[c] ?? c).join(" and ")

/**
 * Step 1 of 3: four questions, real results straight away. If nothing fits, it says exactly what would
 * change that (each suggestion re-checked on the server), and always shows the next step: the deep search.
 */
export function QuickMatch() {
  const router = useRouter()
  // Each script fetched on tap costs a full round trip on a slow network, so load the next routes now.
  React.useEffect(() => {
    router.prefetch("/discover")
    router.prefetch("/onboarding")
  }, [router])
  const [field, setField] = React.useState<string>(FIELDS[0].value)
  const [cgpa, setCgpa] = React.useState("3.8")
  const [scale, setScale] = React.useState("5")
  const [budget, setBudget] = React.useState("80")
  const [countries, setCountries] = React.useState<CountryCode[]>([])
  const [countryError, setCountryError] = React.useState<string | null>(null)
  const [view, setView] = React.useState<QuickView | null>(null)
  const [searched, setSearched] = React.useState<Search | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [failed, setFailed] = React.useState(false)
  const results = React.useRef<HTMLElement>(null)
  // Invisible bot check. It loads once the page is idle (or the form is touched), so the first paint stays
  // fast and a token is usually ready by the time the student taps.
  const { box: captchaBox, ...captcha } = useTurnstile({ invisible: true, lazy: true })
  const startCaptcha = captcha.start
  React.useEffect(() => {
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(startCaptcha, { timeout: 3000 })
      return () => window.cancelIdleCallback(id)
    }
    const id = setTimeout(startCaptcha, 1500)
    return () => clearTimeout(id)
  }, [startCaptcha])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (countries.length === 0) {
      setCountryError("Choose at least one country, so we search where you want to go.")
      return
    }
    track("landing_quick_match")
    await runMatch({ field, budget, countries })
  }

  /** Runs a search. Suggestions call this with one thing changed, and the form updates to match. */
  async function runMatch(search: Search) {
    setField(search.field)
    setBudget(search.budget)
    setCountries(search.countries)
    setLoading(true)
    setFailed(false)
    try {
      const token = await captcha.nextToken()
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          quick_match: true,
          nationality: QUICK_NATIONALITY,
          field: search.field,
          cgpa: Number(cgpa),
          cgpa_scale: Number(scale),
          budget_total_minor: Number(search.budget) * MILLION_KOBO,
          target_cycle: nextCycle(new Date()),
          accommodation_pref: "university_halls", // same basis as the full results, so prices match
          preferred_countries: search.countries,
          ...(token && { turnstile_token: token }),
        }),
      })
      captcha.reset() // a token works once
      if (!res.ok) throw new Error("match failed")
      const result = (await res.json()) as QuickView
      setView(result)
      setSearched(search)
      logActivity("quick_match_run", { properties: { results: Math.min(100, result.ranked.length) } })
      // Carried into the deep search, so the student never answers these twice.
      draftStore.set({
        ...draftStore.get(),
        field: search.field,
        cgpa,
        cgpa_scale: scale,
        budget_millions: search.budget,
        countries: search.countries,
      })
      requestAnimationFrame(() => results.current?.scrollIntoView({ block: "start", behavior: "smooth" }))
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  const top = view?.ranked.slice(0, RESULTS) ?? []
  const near = top.length === 0 ? (view?.near_misses.slice(0, RESULTS) ?? []) : []
  const suggestions = view?.suggestions ?? []

  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-3">
        <form
          onSubmit={submit}
          onFocus={captcha.start}
          onPointerDown={captcha.start}
          className="flex flex-col gap-3"
          aria-label="Quick match"
          noValidate
        >
          <label className="flex flex-col gap-1 text-sm font-medium">
            What do you want to study?
            <select className={control} value={field} onChange={(e) => setField(e.target.value)}>
              {FIELDS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-[1fr_6rem] gap-2">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Your CGPA
              <input
                className={control}
                inputMode="decimal"
                required
                value={cgpa}
                onChange={(e) => setCgpa(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Out of
              <select className={control} value={scale} onChange={(e) => setScale(e.target.value)}>
                <option value="5">5.0</option>
                <option value="4">4.0</option>
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Total budget, in millions of naira
            <input
              className={control}
              inputMode="numeric"
              required
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </label>
          <CountryChips
            legend="Where do you want to study?"
            selected={countries}
            onChange={(next) => {
              setCountries(next)
              setCountryError(null)
            }}
            nationality={QUICK_NATIONALITY}
            max={MAX_COUNTRIES}
            emptyHint={`Choose 1 or ${MAX_COUNTRIES}.`}
            error={countryError}
          />
          {captcha.enabled && <div ref={captchaBox} data-testid="turnstile" />}
          <Button type="submit" variant="accent" size="lg" block loading={loading}>
            See my matches
          </Button>
          {failed && (
            <p role="alert" className="text-sm text-danger-strong">
              We couldn&apos;t run that search. Check your CGPA and budget, then try again.
            </p>
          )}
          {captcha.failed && (
            <p role="alert" className="text-sm text-danger-strong">
              The security check didn&apos;t load. Refresh the page and try again.
            </p>
          )}
        </form>
      </Card>

      {view && searched && (
        <section ref={results} aria-label="Your quick matches" className="flex scroll-mt-4 flex-col gap-3">
          <div role="status" data-testid="quick-summary" className="flex flex-col gap-0.5">
            <h2 className="font-heading text-lg font-bold">
              {top.length > 0
                ? `${view.ranked.length} programme${view.ranked.length === 1 ? "" : "s"} fit, in ${countryList(searched.countries)}`
                : `Nothing fits yet in ${countryList(searched.countries)}`}
            </h2>
            <p className="text-sm text-muted-foreground">
              {fieldLabel(searched.field)}, CGPA {cgpa}/{scale}, budget ₦{searched.budget}m.
              {top.length > 0 && view.ranked.length > RESULTS ? ` Showing the best ${RESULTS}.` : ""}
            </p>
          </div>

          {top.map((c) => (
            <Card key={c.id} data-testid="quick-result" className="gap-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-heading text-base leading-snug font-bold">{c.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {c.university.replace(/^Demo — /, "")}, {c.city}
                  </p>
                </div>
                <FitRing score={c.fit} band={c.group} size="sm" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="money text-lg font-bold">{formatShort(BigInt(c.cost.total_ngn_market), "NGN")}</span>
                <BudgetChip cost={c.cost} />
              </div>
            </Card>
          ))}

          {top.length === 0 && (
            <Card data-testid="no-match-help" className="gap-2">
              <h3 className="font-heading text-base font-bold">
                {suggestions.length > 0
                  ? "Here's what would change that"
                  : "No programmes in our list fit these answers yet"}
              </h3>
              {suggestions.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {suggestions.map((s) => (
                    <li key={s.kind}>
                      <Button
                        variant="outline"
                        block
                        className="h-auto justify-between py-2 text-left whitespace-normal"
                        data-testid={`suggest-${s.kind}`}
                        onClick={() =>
                          void runMatch(
                            s.kind === "budget"
                              ? { ...searched, budget: String(Number(s.budget_minor) / MILLION_KOBO) }
                              : s.kind === "countries"
                                ? { ...searched, countries: s.countries.slice(0, MAX_COUNTRIES) as CountryCode[] }
                                : { ...searched, field: s.field }
                          )
                        }
                      >
                        <span>
                          {s.kind === "budget"
                            ? `Raise your budget to ₦${Number(s.budget_minor) / MILLION_KOBO}m`
                            : s.kind === "countries"
                              ? `Look in ${countryList(s.countries)} instead`
                              : `Try ${fieldLabel(s.field)}`}
                          <span className="block text-xs text-muted-foreground">
                            {s.count} programme{s.count === 1 ? "" : "s"} would fit
                          </span>
                        </span>
                        <ArrowRight className="size-4 shrink-0" aria-hidden />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm">
                  Try another course or country above. The deep search below also checks options a quick search
                  can&apos;t, like scholarships and cheaper cities.
                </p>
              )}
              {near.length > 0 && (
                <div className="flex flex-col gap-1.5 pt-1">
                  <p className="text-sm font-medium">Closest options right now</p>
                  {near.map((n) => (
                    <div key={n.id} data-testid="quick-result" className="rounded-button border border-border p-2.5">
                      <p className="text-sm font-semibold">{n.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {n.university.replace(/^Demo — /, "")}, {n.city}
                      </p>
                      <p className="money text-sm font-medium">
                        {formatShort(BigInt(n.gap_ngn_minor), "NGN")} over your budget
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          <p className="text-xs text-muted-foreground">
            Costs include tuition, living, visa, health and flights in naira
            {view.fx_fallback?.length ? ", at today's mid-market exchange rate" : ""}. We&apos;ve assumed a Nigerian
            passport; English tests are checked in the deep search.
          </p>

          <Card data-testid="next-step" className="gap-2 border-primary/40 bg-primary-tint">
            <p className="text-xs font-semibold tracking-wide text-primary-strong uppercase">
              Step 2 of 3 · Deep search
            </p>
            <h3 className="font-heading text-base font-bold">Get matches checked against every entry rule</h3>
            <p className="text-sm">
              Tell us about your degree, English test and when you&apos;d like to start. It takes about 5 minutes, and
              the 4 answers you just gave are already filled in.
            </p>
            <Button asChild block>
              <Link href="/onboarding">Continue to deep search</Link>
            </Button>
          </Card>
        </section>
      )}
    </div>
  )
}
