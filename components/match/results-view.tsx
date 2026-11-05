"use client"

import { LazyMotion, m, MotionConfig } from "framer-motion"
import Link from "next/link"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { saveProfile } from "@/lib/match/profile-store"
import { BAND_LABEL, COUNTRY_LABEL, TERM_LABEL } from "@/lib/match/labels"
import type { CardView, MatchView, NearMissView } from "@/lib/match/present"
import type { MatchProfile } from "@/lib/match/types"
import { applyViewFilters, NO_FILTERS, type FeeBand, type SortKey, type ViewFilters } from "@/lib/match/view-filters"
import { rebalance, WEIGHT_LABELS, type WeightKey } from "@/lib/match/weights"
import { formatShort } from "@/lib/money"
import { cn } from "@/lib/utils"

import { CostSheet } from "./cost-sheet"
import { BudgetChip, ProgrammeHeading } from "./card-parts"
import { MatchCard, type Explanation } from "./match-card"

const DEBOUNCE_MS = 250
const RETRY_MS = 1500
const MAX_COMPARE = 3
const MILLION_KOBO = 100_000_000
const GAUGE_MIN = 10
const GAUGE_MAX = 150
const SAVED_KEY = "sb-saved"

const loadMotion = () => import("@/components/ui/motion-features").then((mod) => mod.default)

type Tab = "ranked" | "closest" | "restricted"

const NONE_SAVED: string[] = []
let savedList: string[] | null = null
const savedListeners = new Set<() => void>()

/** Saved programmes live in this browser until accounts exist. */
const savedStore = {
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
  toggle(id: string) {
    const list = savedStore.get()
    savedList = list.includes(id) ? list.filter((s) => s !== id) : [...list, id]
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(savedList))
    } catch {
      // The button still works for this visit.
    }
    savedListeners.forEach((listener) => listener())
  },
}

function useExplanations(view: MatchView, profile: MatchProfile) {
  const [explanations, setExplanations] = React.useState<Record<string, Explanation>>({})
  const [doneKey, setDoneKey] = React.useState("")
  const key = view.ranked.map((c) => c.id).join()

  React.useEffect(() => {
    if (!key) return
    const controller = new AbortController()
    async function stream() {
      const res = await fetch("/api/match/explanations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(profile),
        signal: controller.signal,
      })
      const reader = res.body?.pipeThrough(new TextDecoderStream()).getReader()
      let buffer = ""
      while (reader) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += value
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""
        const parsed = lines.filter(Boolean).map((line) => JSON.parse(line) as Explanation & { programme_id: string })
        setExplanations((prev) => ({
          ...prev,
          ...Object.fromEntries(parsed.map((e) => [e.programme_id, { why: e.why, watch_out: e.watch_out }])),
        }))
      }
    }
    stream()
      .catch(() => undefined) // Results don't depend on explanations.
      .finally(() => {
        if (!controller.signal.aborted) setDoneKey(key)
      })
    return () => controller.abort()
    // The list of ids decides when to fetch; the profile only travels with it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { explanations, explaining: doneKey !== key }
}

function BudgetGauge({
  millions,
  onChange,
  cards,
}: {
  millions: number
  onChange: (value: number) => void
  cards: { id: string; cost: CardView["cost"] }[]
}) {
  const position = (value: number) => `${((value - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN)) * 100}%`
  return (
    <Card className="gap-2" data-testid="budget-gauge">
      <label htmlFor="budget" className="flex items-baseline justify-between gap-2 text-sm font-medium">
        Your budget
        <span className="money text-xl font-bold">₦{millions}m</span>
      </label>
      <div className="relative">
        <input
          id="budget"
          type="range"
          min={GAUGE_MIN}
          max={GAUGE_MAX}
          step={1}
          value={millions}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-11 w-full accent-primary"
        />
        <div aria-hidden className="pointer-events-none relative h-2">
          {cards.map((c) => {
            const value = Number(BigInt(c.cost.total_ngn_market) / BigInt(MILLION_KOBO))
            if (value < GAUGE_MIN || value > GAUGE_MAX) return null
            return (
              <span
                key={c.id}
                data-testid="budget-mark"
                className="absolute top-0 h-2 w-0.5 rounded-full bg-muted-foreground"
                style={{ left: position(value) }}
              />
            )
          })}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Each mark is a programme&apos;s total first-year cost.</p>
    </Card>
  )
}

const checkbox = "size-5 accent-primary"
const select = "h-11 w-full rounded-button border border-border bg-surface px-3 text-sm"

function FilterRail({
  filters,
  onChange,
  cities,
}: {
  filters: ViewFilters
  onChange: (next: ViewFilters) => void
  cities: string[]
}) {
  const set = <K extends keyof ViewFilters>(key: K, value: ViewFilters[K]) => onChange({ ...filters, [key]: value })
  const toggles: [keyof ViewFilters, string][] = [
    ["noGre", "No GRE needed"],
    ["coop", "Co-op or placement"],
    ["scholarships", "Scholarships"],
  ]
  return (
    <div className="flex flex-col gap-3 pt-2 text-sm">
      <fieldset className="flex flex-wrap gap-x-4">
        <legend className="mb-1 font-medium">Country</legend>
        {Object.entries(COUNTRY_LABEL).map(([code, label]) => (
          <label key={code} className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              className={checkbox}
              checked={filters.countries.includes(code)}
              onChange={(e) =>
                set(
                  "countries",
                  e.target.checked ? [...filters.countries, code] : filters.countries.filter((c) => c !== code)
                )
              }
            />
            {label}
          </label>
        ))}
      </fieldset>
      <label className="flex flex-col gap-1 font-medium">
        City
        <select className={select} value={filters.city} onChange={(e) => set("city", e.target.value)}>
          <option value="">Any city</option>
          {cities.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 font-medium">
        Total cost
        <select className={select} value={filters.feeBand} onChange={(e) => set("feeBand", e.target.value as FeeBand)}>
          <option value="any">Any</option>
          <option value="under_50m">Under ₦50m</option>
          <option value="50m_70m">₦50m to ₦70m</option>
          <option value="70m_plus">₦70m or more</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 font-medium">
        Intake
        <select className={select} value={filters.term} onChange={(e) => set("term", e.target.value)}>
          <option value="">Any term</option>
          {Object.entries(TERM_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {toggles.map(([key, label]) => (
        <label key={key} className="flex min-h-11 items-center gap-2">
          <input
            type="checkbox"
            className={checkbox}
            checked={filters[key] as boolean}
            onChange={(e) => set(key, e.target.checked as never)}
          />
          {label}
        </label>
      ))}
    </div>
  )
}

function WeightSliders({
  profile,
  onChange,
}: {
  profile: MatchProfile
  onChange: (w: MatchProfile["weights"]) => void
}) {
  return (
    <div className="flex flex-col gap-1 pt-2 text-sm">
      {(Object.keys(WEIGHT_LABELS) as WeightKey[]).map((key) => (
        <label key={key} className="flex flex-col">
          <span className="flex justify-between">
            {WEIGHT_LABELS[key]}
            <span className="money text-muted-foreground">{profile.weights[key]}</span>
          </span>
          <input
            type="range"
            min={0}
            max={100}
            value={profile.weights[key]}
            onChange={(e) => onChange(rebalance(profile.weights, key, Number(e.target.value)))}
            className="h-11 w-full accent-primary"
          />
        </label>
      ))}
    </div>
  )
}

/** A collapsed section. Its contents only render once opened, to keep the first page small. */
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  return (
    <details
      className="rounded-card border border-border bg-card px-4 py-2"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">{title}</summary>
      {open && children}
    </details>
  )
}

function CompareView({ cards, view }: { cards: CardView[]; view: MatchView }) {
  if (cards.length === 0) {
    return <p className="text-sm text-muted-foreground">Tap Compare on up to 3 programmes to see them side by side.</p>
  }
  const rows: [string, (c: CardView) => React.ReactNode][] = [
    ["University", (c) => c.university.replace(/^Demo — /, "")],
    ["City", (c) => c.city],
    ["Fit", (c) => Math.round(c.fit)],
    [
      "Total first year",
      (c) => (
        <CostSheet title={c.title} cost={c.cost} fx={view.fx}>
          <span className="money">{formatShort(BigInt(c.cost.total_ngn_market), "NGN")}</span>
        </CostSheet>
      ),
    ],
    ["Budget", (c) => <BudgetChip cost={c.cost} />],
    ["Length", (c) => `${c.duration_months} months`],
    ["Entry", (c) => BAND_LABEL[c.min_class ?? ""] ?? "Not stated"],
    ["IELTS", (c) => c.ielts_min ?? "Not stated"],
    ["Co-op", (c) => (c.has_coop ? "Yes" : "No")],
    ["Deadline", (c) => c.next_deadline.date],
  ]
  const columns = { gridTemplateColumns: `repeat(${cards.length}, minmax(0, 1fr))` }
  return (
    <div data-testid="compare-view" className="flex flex-col gap-3 text-sm">
      <div className="grid gap-2" style={columns}>
        {cards.map((c) => (
          <h3 key={c.id} className="font-heading text-sm leading-snug font-bold break-words">
            <Link href={`/programmes/${c.id}`}>{c.title}</Link>
          </h3>
        ))}
      </div>
      {rows.map(([label, value]) => (
        <div key={label} className="flex flex-col gap-1 border-t border-border pt-2">
          <span className="text-xs text-muted-foreground">{label}</span>
          <div className="grid gap-2" style={columns}>
            {cards.map((c) => (
              <div key={c.id} className="min-w-0 break-words">
                {value(c)}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function NearMissCard({ item, view }: { item: NearMissView; view: MatchView }) {
  return (
    <Card data-testid="near-miss" className="gap-3">
      <ProgrammeHeading programme={item} />
      <CostSheet title={item.title} cost={item.cost} fx={view.fx}>
        <span className="money text-xl font-bold">
          {formatShort(BigInt(item.gap_ngn_minor), "NGN")} over your budget
        </span>
      </CostSheet>
      <p className="text-sm text-muted-foreground">
        Total first year {formatShort(BigInt(item.cost.total_ngn_market), "NGN")}, including estimated visa, health and
        flight figures.
      </p>
      {item.scholarships.length > 0 ? (
        <div className="flex flex-col gap-1 text-sm">
          <p className="font-medium">Scholarships that would help</p>
          <ul className="flex flex-col gap-1">
            {item.scholarships.map((s) => (
              <li key={s.name}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">
                  {s.name.replace(/^Demo — /, "")}
                </a>
                {s.amount_minor && s.currency ? `: ${formatShort(BigInt(s.amount_minor), s.currency)}` : ""}
                {s.deadline ? `, apply by ${s.deadline}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No open scholarships match you for this programme yet.</p>
      )}
    </Card>
  )
}

const EMPTY_VIEW: MatchView = {
  band: null,
  grades_source: "",
  budget_minor: null,
  ranked: [],
  more: [],
  near_misses: [],
  restricted: [],
  needs_english: [],
  excluded: {},
  fx: { market: {}, official: {} },
  now: "",
}

type ResultsViewProps = {
  initialProfile: MatchProfile
  confidence: string | null
  grades: string | null
  /** Server-rendered cards, shown until the interactive list loads. */
  preview: React.ReactNode
  counts: { ranked: number; closest: number; restricted: number }
}

export function ResultsView({ initialProfile, confidence, grades, preview, counts }: ResultsViewProps) {
  const [loaded, setLoaded] = React.useState<MatchView | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [reloads, setReloads] = React.useState(0)
  const view = loaded ?? EMPTY_VIEW
  const [profile, setProfile] = React.useState(initialProfile)
  const [tab, setTab] = React.useState<Tab>("ranked")
  const [mode, setMode] = React.useState<"list" | "compare">("list")
  const [filters, setFilters] = React.useState(NO_FILTERS)
  const [compare, setCompare] = React.useState<string[]>([])
  const saved = React.useSyncExternalStore(savedStore.subscribe, savedStore.get, savedStore.getServer)
  const { explanations, explaining } = useExplanations(view, profile)
  const now = React.useMemo(() => new Date(view.now || 0), [view.now])
  const firstRun = React.useRef(true)

  // Budget, weights and the related-fields toggle change the ranking itself, so they go back to the server.
  React.useEffect(() => {
    const first = firstRun.current
    firstRun.current = false
    if (!first) saveProfile(profile)
    const controller = new AbortController()
    const load = async (attemptsLeft: number) => {
      const res = await fetch("/api/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(profile),
        signal: controller.signal,
      }).catch(() => null)
      if (controller.signal.aborted) return
      if (res?.ok) {
        setLoaded((await res.json()) as MatchView)
        setFailed(false)
      } else if (attemptsLeft > 0) {
        retry = setTimeout(() => void load(attemptsLeft - 1), RETRY_MS)
      } else {
        setFailed(true)
      }
    }
    let retry: ReturnType<typeof setTimeout> | undefined
    const timer = setTimeout(() => void load(1), first ? 0 : DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      clearTimeout(retry)
      controller.abort()
    }
  }, [profile, reloads])

  const update = (patch: Partial<MatchProfile>) => setProfile((p) => ({ ...p, ...patch }))

  const all = React.useMemo(() => [...view.ranked, ...view.more], [view])
  const shown = applyViewFilters(view.ranked, filters)
  const more = applyViewFilters(view.more, filters)
  const cities = [...new Set(all.map((c) => c.city))].sort()
  const budgetMillions = Math.round((profile.budget_total_minor ?? 0) / MILLION_KOBO)
  const compareCards = compare.flatMap((id) => all.find((c) => c.id === id) ?? [])

  const card = (c: CardView) => (
    <m.li key={c.id} layout="position" transition={{ duration: 0.2, ease: "easeOut" }}>
      <MatchCard
        card={c}
        fx={view.fx}
        now={now}
        explanation={explanations[c.id]}
        explaining={explaining}
        saved={saved.includes(c.id)}
        onSave={() => savedStore.toggle(c.id)}
        compared={compare.includes(c.id)}
        compareDisabled={!compare.includes(c.id) && compare.length >= MAX_COMPARE}
        onCompare={() => setCompare((ids) => (ids.includes(c.id) ? ids.filter((id) => id !== c.id) : [...ids, c.id]))}
      />
    </m.li>
  )

  const tabs: [Tab, string, number][] = [
    ["ranked", "Ranked", loaded ? view.ranked.length + view.more.length : counts.ranked],
    ["closest", "Closest options", loaded ? view.near_misses.length : counts.closest],
    ["restricted", "Restricted for your nationality", loaded ? view.restricted.length : counts.restricted],
  ]

  return (
    <div className="flex flex-col gap-4" data-loaded={loaded !== null}>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold">Your matches</h1>
        <p className="text-sm text-muted-foreground">
          {profile.target_cycle} entry{grades ? `, ${grades}` : ""}
          {confidence ? `. Match confidence: ${confidence}` : ""}
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
        <aside className="flex flex-col gap-3">
          <BudgetGauge
            millions={budgetMillions}
            cards={[...all, ...view.near_misses]}
            onChange={(value) => update({ budget_total_minor: value * MILLION_KOBO })}
          />
          <label className="flex min-h-11 items-center gap-3 rounded-card border border-border bg-card px-4 text-sm font-medium">
            <input
              type="checkbox"
              className={checkbox}
              checked={profile.include_related_fields}
              onChange={(e) => update({ include_related_fields: e.target.checked })}
            />
            Show related fields
          </label>
          <Panel title="Filters">
            <FilterRail filters={filters} onChange={setFilters} cities={cities} />
          </Panel>
          <Panel title="What matters most">
            <WeightSliders profile={profile} onChange={(weights) => update({ weights })} />
          </Panel>
        </aside>

        <section className="flex min-w-0 flex-col gap-4" aria-label="Results">
          {failed && (
            <div role="alert" className="flex items-center justify-between gap-3 text-sm">
              <span>We couldn&apos;t refresh your matches. Check your connection.</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setFailed(false)
                  setReloads((n) => n + 1)
                }}
              >
                Try again
              </Button>
            </div>
          )}
          <div
            role="tablist"
            aria-label="Result lists"
            className="grid grid-cols-3 gap-1 rounded-button bg-surface-subtle p-1"
          >
            {tabs.map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  "min-h-11 rounded-button px-1 py-1 text-xs leading-tight font-medium",
                  tab === id ? "bg-primary text-primary-foreground" : "text-ink"
                )}
              >
                {label} ({count})
              </button>
            ))}
          </div>

          {tab === "ranked" && (
            <div role="tabpanel" aria-label="Ranked" className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-2">
                <div role="group" aria-label="View" className="flex gap-1">
                  {(["list", "compare"] as const).map((m_) => (
                    <Button
                      key={m_}
                      size="sm"
                      variant={mode === m_ ? "secondary" : "ghost"}
                      aria-pressed={mode === m_}
                      onClick={() => setMode(m_)}
                    >
                      {m_ === "list" ? "List" : `Compare (${compare.length})`}
                    </Button>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <span className="sr-only sm:not-sr-only">Sort</span>
                  <select
                    aria-label="Sort by"
                    className="h-11 rounded-button border border-border bg-surface px-2 text-sm"
                    value={filters.sort}
                    onChange={(e) => setFilters({ ...filters, sort: e.target.value as SortKey })}
                  >
                    <option value="fit">Best fit</option>
                    <option value="cost">Lowest cost</option>
                    <option value="deadline">Soonest deadline</option>
                  </select>
                </label>
              </div>

              {!loaded ? (
                preview
              ) : mode === "compare" ? (
                <CompareView cards={compareCards} view={view} />
              ) : (
                <LazyMotion features={loadMotion}>
                  <MotionConfig reducedMotion="user">
                    {shown.length === 0 ? (
                      <Card>
                        <p className="text-sm">
                          Nothing matches yet.{" "}
                          {view.near_misses.length > 0 && (
                            <button type="button" className="underline" onClick={() => setTab("closest")}>
                              See your closest options
                            </button>
                          )}
                        </p>
                      </Card>
                    ) : (
                      <ul className="flex flex-col gap-4">{shown.map(card)}</ul>
                    )}
                    {more.length > 0 && (
                      <>
                        <h2 className="text-lg font-bold">More matches</h2>
                        <ul className="flex flex-col gap-4">{more.map(card)}</ul>
                      </>
                    )}
                  </MotionConfig>
                </LazyMotion>
              )}

              {view.needs_english.length > 0 && (
                <div className="flex flex-col gap-3">
                  <h2 className="text-lg font-bold">Needs English test</h2>
                  <p className="text-sm text-muted-foreground">
                    These fit once you have a score from the test you&apos;ve planned.
                  </p>
                  {view.needs_english.map((n) => (
                    <Card key={n.id} className="gap-2">
                      <ProgrammeHeading programme={n} />
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "closest" && (
            <div role="tabpanel" aria-label="Closest options" className="flex flex-col gap-4">
              {!loaded ? (
                <p className="text-sm text-muted-foreground">Loading your closest options…</p>
              ) : view.near_misses.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Closest options appear when fewer than 3 programmes fit your budget.
                </p>
              ) : (
                view.near_misses.map((n) => <NearMissCard key={n.id} item={n} view={view} />)
              )}
            </div>
          )}

          {tab === "restricted" && (
            <div role="tabpanel" aria-label="Restricted for your nationality" className="flex flex-col gap-4">
              {!loaded ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : view.restricted.length === 0 ? (
                <p className="text-sm text-muted-foreground">No programmes are restricted for your nationality.</p>
              ) : (
                view.restricted.map((r) => (
                  <Card key={r.id} data-testid="restricted" className="gap-2">
                    <ProgrammeHeading programme={r} />
                    <p className="text-sm">{r.reason}</p>
                    <a
                      href={r.reason_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm underline underline-offset-4"
                    >
                      Read the official source
                    </a>
                    {r.review_due && <p className="text-xs text-muted-foreground">Next review {r.review_due}.</p>}
                  </Card>
                ))
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
