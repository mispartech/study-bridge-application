"use client"

import { Check } from "lucide-react"
import * as React from "react"

import { cn } from "@/lib/utils"

type Option = { key: string; label: string; description: string }

const MAX_GOALS = 5

/**
 * "What do you want after you study?": the goals the admin has switched on, more than one allowed. Results are
 * tailored to the ones ticked; ticking none keeps the standard ranking.
 */
export function GoalPicker({ selected, onChange }: { selected: string[]; onChange: (next: string[]) => void }) {
  const [options, setOptions] = React.useState<Option[] | null>(null)
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    const controller = new AbortController()
    fetch("/api/pathways", { signal: controller.signal })
      .then((res) => (res.ok ? (res.json() as Promise<{ pathways: Option[] }>) : Promise.reject(new Error())))
      .then((body) => setOptions(body.pathways))
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })
    return () => controller.abort()
  }, [])

  if (failed) return <p className="text-sm text-muted-foreground">Goals couldn&apos;t load. You can add them later.</p>
  if (!options) return <p className="text-sm text-muted-foreground">Loading…</p>
  if (options.length === 0) return null

  const toggle = (key: string) =>
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key].slice(0, MAX_GOALS))

  return (
    <ul className="flex flex-col gap-2" data-testid="goal-picker">
      {options.map((o) => {
        const on = selected.includes(o.key)
        return (
          <li key={o.key}>
            <button
              type="button"
              aria-pressed={on}
              onClick={() => toggle(o.key)}
              data-testid={`goal-${o.key}`}
              className={cn(
                "flex w-full items-start gap-3 rounded-button border p-3 text-left",
                on ? "border-primary bg-primary-tint" : "border-border bg-surface"
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border",
                  on ? "border-primary bg-primary text-primary-foreground" : "border-border"
                )}
              >
                {on && <Check className="size-3.5" />}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className={cn("font-medium", on && "text-primary-strong")}>{o.label}</span>
                {o.description && <span className="text-sm text-muted-foreground">{o.description}</span>}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
