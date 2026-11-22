"use client"

import { Check, ChevronDown, MapPin } from "lucide-react"
import * as React from "react"

import type { CountryCode } from "@/lib/match/countries"
import { COUNTRY_LABEL } from "@/lib/match/labels"
import type { Locations } from "@/lib/match/locations"
import { cn } from "@/lib/utils"

type Props = {
  countries: CountryCode[]
  /** Chosen provinces, states and cities, by name. */
  selected: string[]
  onChange: (next: string[]) => void
}

function Toggle({
  on,
  onClick,
  children,
  testId,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
  testId?: string
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-sm",
        on ? "border-primary bg-primary-tint font-medium text-primary-strong" : "border-border bg-surface text-ink"
      )}
    >
      {on && <Check className="size-3.5" aria-hidden />}
      {children}
    </button>
  )
}

/**
 * Optional: provinces, states or cities within the chosen countries, more than one allowed. Folded away by
 * default, since most students don't mind. Only places with listed programmes appear.
 */
export function CityPicker({ countries, selected, onChange }: Props) {
  const [open, setOpen] = React.useState(selected.length > 0)
  const [locations, setLocations] = React.useState<Locations | null>(null)
  const [failed, setFailed] = React.useState(false)
  const key = [...countries].sort().join(",")

  React.useEffect(() => {
    if (!open || !key) return
    const controller = new AbortController()
    fetch(`/api/locations?countries=${key}`, { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<{ locations: Locations }>) : Promise.reject(new Error())))
      .then((body) => setLocations(body.locations))
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })
    return () => controller.abort()
  }, [open, key])

  const toggle = (name: string) =>
    onChange(selected.includes(name) ? selected.filter((s) => s !== name) : [...selected, name])

  return (
    <div className="rounded-button border border-border" data-testid="city-picker">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => {
          setFailed(false)
          setOpen(!open)
        }}
        className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm font-medium"
      >
        <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
        <span className="flex-1">
          Particular provinces, states or cities?{" "}
          <span className="font-normal text-muted-foreground">
            {selected.length > 0 ? `${selected.length} chosen` : "Optional"}
          </span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-border p-3">
          {countries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Choose a country above first.</p>
          ) : failed ? (
            <p role="alert" className="text-sm text-danger-strong">
              We couldn&apos;t load the places just now. You can carry on without them.
            </p>
          ) : !locations ? (
            <p className="text-sm text-muted-foreground">Loading places…</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Tap a province or state for anywhere in it, or pick cities. Matches there rank higher; others still
                show.
              </p>
              {countries.map((country) => {
                const regions = locations[country] ?? []
                return (
                  <section key={country} className="flex flex-col gap-2" aria-label={COUNTRY_LABEL[country]}>
                    {countries.length > 1 && <h3 className="text-sm font-semibold">{COUNTRY_LABEL[country]}</h3>}
                    {regions.length === 0 && (
                      <p className="text-sm text-muted-foreground">No programmes listed here yet.</p>
                    )}
                    {regions.map(({ region, cities }) => (
                      <div key={region} className="flex flex-wrap gap-1.5">
                        <Toggle
                          on={selected.includes(region)}
                          onClick={() => toggle(region)}
                          testId={`place-${region}`}
                        >
                          <span className="font-medium">{region}</span>
                          {selected.includes(region) ? "" : " (all)"}
                        </Toggle>
                        {!selected.includes(region) &&
                          cities
                            .filter((city) => city !== region)
                            .map((city) => (
                              <Toggle
                                key={city}
                                on={selected.includes(city)}
                                onClick={() => toggle(city)}
                                testId={`place-${city}`}
                              >
                                {city}
                              </Toggle>
                            ))}
                      </div>
                    ))}
                  </section>
                )
              })}
              {selected.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="self-start text-sm underline underline-offset-4"
                >
                  Clear places
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
