"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"

import { track } from "@/lib/analytics/track"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { FitRing } from "@/components/ui/fit-ring"
import type { CountryCode } from "@/lib/match/countries"
import { draftStore } from "@/lib/match/profile-store"
import { FIELDS, nextCycle } from "@/lib/match/labels"
import type { MatchView } from "@/lib/match/present"
import { formatShort } from "@/lib/money"

import { BudgetChip } from "./card-parts"
import { CountryChips } from "./country-chips"

const RESULTS = 3
const QUICK_NATIONALITY = "NG"
const control = "h-11 w-full rounded-button border border-border bg-surface px-3 text-[0.9375rem]"

export function QuickMatch() {
  const router = useRouter()
  // Each script fetched on tap costs a full round trip on a slow network, so load the results route now.
  React.useEffect(() => router.prefetch("/discover"), [router])
  const [field, setField] = React.useState<string>(FIELDS[0].value)
  const [cgpa, setCgpa] = React.useState("3.8")
  const [scale, setScale] = React.useState("5")
  const [budget, setBudget] = React.useState("80")
  const [countries, setCountries] = React.useState<CountryCode[]>([])
  const [view, setView] = React.useState<(MatchView & { hidden_by_country?: number }) | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [failed, setFailed] = React.useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    track("landing_quick_match")
    await runMatch(countries)
  }

  async function runMatch(chosen: CountryCode[]) {
    setLoading(true)
    setFailed(false)
    try {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          quick_match: true,
          nationality: QUICK_NATIONALITY,
          field,
          cgpa: Number(cgpa),
          cgpa_scale: Number(scale),
          budget_total_minor: Number(budget) * 100_000_000,
          target_cycle: nextCycle(new Date()),
          accommodation_pref: "university_halls", // same basis as the full results, so prices match
          preferred_countries: chosen,
        }),
      })
      if (!res.ok) throw new Error("match failed")
      setView((await res.json()) as MatchView)
      draftStore.set({
        ...draftStore.get(),
        field,
        cgpa,
        cgpa_scale: scale,
        budget_millions: budget,
        countries: chosen,
      })
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  const top = view?.ranked.slice(0, RESULTS) ?? []
  const near = top.length === 0 ? (view?.near_misses.slice(0, RESULTS) ?? []) : []

  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-3">
        <form onSubmit={submit} className="flex flex-col gap-3" aria-label="Quick match">
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
            legend="Where? (optional)"
            selected={countries}
            onChange={setCountries}
            nationality={QUICK_NATIONALITY}
          />
          <Button type="submit" variant="accent" size="lg" block loading={loading}>
            See my matches
          </Button>
          {failed && (
            <p role="alert" className="text-sm text-danger-strong">
              We couldn&apos;t run that match. Check your CGPA and budget, then try again.
            </p>
          )}
        </form>
      </Card>

      {view && (
        <section aria-label="Your quick matches" className="flex flex-col gap-3">
          {(view.hidden_by_country ?? 0) > 0 && (
            <button
              type="button"
              data-testid="show-other-countries"
              className="min-h-11 self-start text-sm font-medium underline underline-offset-4"
              onClick={() => {
                setCountries([])
                void runMatch([])
              }}
            >
              Show other countries
            </button>
          )}
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
          {near.map((n) => (
            <Card key={n.id} data-testid="quick-result" className="gap-1">
              <h3 className="font-heading text-base leading-snug font-bold">{n.title}</h3>
              <p className="text-sm text-muted-foreground">
                {n.university.replace(/^Demo — /, "")}, {n.city}
              </p>
              <p className="money font-medium">{formatShort(BigInt(n.gap_ngn_minor), "NGN")} over your budget</p>
            </Card>
          ))}
          {top.length === 0 && near.length === 0 && (
            <p className="text-sm">Nothing matches yet. Try a higher budget or another field.</p>
          )}
          <p className="text-xs text-muted-foreground">
            Costs include estimated visa, health and flight figures. We&apos;ve assumed you hold a Nigerian passport,
            and we check English and test scores in your full profile.
          </p>
          <Button asChild block>
            <Link href="/onboarding">Get your full matches</Link>
          </Button>
        </section>
      )}
    </div>
  )
}
