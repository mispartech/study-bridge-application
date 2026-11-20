import { Check } from "lucide-react"

import { cn } from "@/lib/utils"

/** The three steps every new student goes through, shown the same way on each page so they know where they are. */
export const JOURNEY = [
  { title: "Quick search", hint: "4 questions" },
  { title: "Deep search", hint: "About 5 minutes" },
  { title: "Save your results", hint: "Optional" },
] as const

export function JourneySteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <nav aria-label="Your progress">
      <ol className="grid grid-cols-3 gap-1.5">
        {JOURNEY.map((step, i) => {
          const n = (i + 1) as 1 | 2 | 3
          const done = n < current
          const here = n === current
          return (
            <li
              key={step.title}
              aria-current={here ? "step" : undefined}
              className={cn(
                "flex flex-col gap-0.5 rounded-button border px-2 py-1.5 text-xs",
                here ? "border-primary bg-primary-tint" : done ? "border-success/40" : "border-border"
              )}
            >
              <span className="flex items-center gap-1 font-semibold">
                <span
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-full text-[0.6875rem]",
                    here ? "bg-primary text-primary-foreground" : done ? "bg-success text-white" : "bg-surface-subtle"
                  )}
                >
                  {done ? <Check className="size-3" aria-hidden /> : n}
                </span>
                {step.title}
              </span>
              <span className={here ? "text-ink" : "text-muted-foreground"}>{step.hint}</span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
