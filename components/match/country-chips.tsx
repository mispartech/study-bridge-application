"use client"

import { Check } from "lucide-react"
import * as React from "react"

import { ALL_COUNTRIES, pickCountry, type CountryCode } from "@/lib/match/countries"
import { COUNTRY_LABEL } from "@/lib/match/labels"
import { cn } from "@/lib/utils"

type VisaNote = { text: string; source_url: string }

/** Published restrictions for this student's nationality, so a closed country is marked before it's picked. */
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
  selected: CountryCode[]
  onChange: (next: CountryCode[]) => void
  nationality: string | null
  travelDocument?: string | null
  legend?: string
  /** Most countries that can be chosen. Omit for no limit. */
  max?: number
  /** What an empty selection means here, shown under the cards (e.g. "Showing every country"). */
  emptyHint?: string
  /** An error to show, e.g. when the form needs at least one country. */
  error?: string | null
}

/**
 * Country cards. A card is selected only when the student taps it, with a tick so the state is obvious.
 * When a limit is set, a third tap is refused with a message instead of silently replacing a choice.
 */
export function CountryChips({
  selected,
  onChange,
  nationality,
  travelDocument = null,
  legend = "Countries",
  max,
  emptyHint,
  error,
}: CountryChipsProps) {
  const notes = useVisaNotes(nationality, travelDocument)
  const [refused, setRefused] = React.useState(false)
  const hintId = React.useId()
  const shownNotes = ALL_COUNTRIES.filter((code) => notes[code] && selected.includes(code))

  function tap(code: CountryCode) {
    const { next, refused: tooMany } = pickCountry(selected, code, max)
    setRefused(tooMany)
    if (!tooMany) onChange(next)
  }

  return (
    <fieldset className="flex flex-col gap-1.5" aria-describedby={hintId}>
      <legend className="text-sm font-medium">{legend}</legend>
      <div className="grid grid-cols-3 gap-1.5">
        {ALL_COUNTRIES.map((code) => {
          const on = selected.includes(code)
          const closed = Boolean(notes[code])
          return (
            <button
              key={code}
              type="button"
              aria-pressed={on}
              data-testid={`country-${code}`}
              onClick={() => tap(code)}
              className={cn(
                "relative flex min-h-11 flex-col items-center justify-center rounded-button border px-2 py-1.5 text-sm font-medium transition-colors",
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface text-ink hover:border-primary/60"
              )}
            >
              <span className="flex items-center gap-1">
                {on && <Check className="size-4" aria-hidden />}
                {COUNTRY_LABEL[code]}
              </span>
              {closed && (
                <span
                  className={cn(
                    "text-[0.6875rem] leading-tight",
                    on ? "text-primary-foreground" : "text-warning-strong"
                  )}
                >
                  Closed to your passport
                </span>
              )}
            </button>
          )
        })}
      </div>
      <p
        id={hintId}
        role="status"
        className={cn("text-xs", refused || error ? "text-danger-strong" : "text-muted-foreground")}
      >
        {refused
          ? `You can choose up to ${max} countries. Tap one you've chosen to remove it first.`
          : error
            ? error
            : selected.length === 0
              ? (emptyHint ?? (max ? `Choose up to ${max}.` : "Choose any."))
              : max
                ? `${selected.length} of ${max} chosen.`
                : `${selected.length} chosen.`}
      </p>
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
