"use client"

import * as React from "react"

import { ALL_COUNTRIES, isSelected, toggleCountry, type CountryCode } from "@/lib/match/countries"
import { COUNTRY_LABEL } from "@/lib/match/labels"
import { cn } from "@/lib/utils"

type VisaNote = { text: string; source_url: string }

/** Published restrictions for this student, fetched only once a restricted country could matter. */
function useVisaNotes(nationality: string | null, travelDocument: string | null) {
  const [notes, setNotes] = React.useState<Record<string, VisaNote>>({})
  React.useEffect(() => {
    if (!nationality || !/^[A-Z]{2}$/.test(nationality)) return
    const params = new URLSearchParams({ nationality, ...(travelDocument && { travel_document: travelDocument }) })
    const controller = new AbortController()
    void fetch(`/api/visa-notes?${params}`, { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<{ notes: Record<string, VisaNote> }>) : null))
      .then((body) => setNotes(body?.notes ?? {}))
      .catch(() => undefined)
    return () => controller.abort()
  }, [nationality, travelDocument])
  return notes
}

type CountryChipsProps = {
  /** Empty means every country. */
  selected: CountryCode[]
  onChange: (next: CountryCode[]) => void
  nationality: string | null
  travelDocument?: string | null
  legend?: string
}

export function CountryChips({
  selected,
  onChange,
  nationality,
  travelDocument = null,
  legend = "Countries",
}: CountryChipsProps) {
  const notes = useVisaNotes(nationality, travelDocument)
  const shownNotes = ALL_COUNTRIES.filter((code) => notes[code] && isSelected(selected, code))
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="grid grid-cols-3 gap-1">
        {ALL_COUNTRIES.map((code) => {
          const on = isSelected(selected, code)
          return (
            <button
              key={code}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(toggleCountry(selected, code))}
              className={cn(
                "min-h-11 rounded-button border px-2 text-sm font-medium",
                on ? "border-primary bg-primary-tint text-primary-strong" : "border-border bg-surface text-ink"
              )}
            >
              {COUNTRY_LABEL[code]}
            </button>
          )
        })}
      </div>
      {shownNotes.map((code) => (
        <p
          key={code}
          data-testid="visa-note"
          className="rounded-button bg-warning-tint p-2 text-xs text-warning-strong"
        >
          {COUNTRY_LABEL[code]}: {notes[code]!.text}{" "}
          {notes[code]!.source_url.startsWith("http") && (
            <a href={notes[code]!.source_url} target="_blank" rel="noopener noreferrer" className="underline">
              Official source
            </a>
          )}
        </p>
      ))}
    </fieldset>
  )
}
