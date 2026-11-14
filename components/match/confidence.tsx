import { confidenceLabel } from "@/lib/match/data-confidence"
import { cn } from "@/lib/utils"

const TONE = {
  High: "text-success-strong",
  Medium: "text-warning-strong",
  Low: "text-danger-strong",
} as const

/** Overall score for this search: profile completeness plus how reliable the top results are. */
export function SearchConfidence({ score }: { score: number | null }) {
  if (score === null) return null
  const label = confidenceLabel(score)
  return (
    <p data-testid="search-confidence" className="text-sm">
      Match confidence:{" "}
      <span className={cn("font-semibold tabular-nums", TONE[label])}>
        {label} ({score}%)
      </span>
      <span className="text-muted-foreground">
        {" "}
        · based on how complete your profile is and how recently we checked these programmes
      </span>
    </p>
  )
}

/** How far the facts behind one result can be relied on. */
export function DataConfidence({ score }: { score: number }) {
  const label = confidenceLabel(score)
  return (
    <span
      data-testid="data-confidence"
      title="How reliable this programme's facts are: their source, when we last checked them, and how many costs are estimates."
      className={cn("text-xs font-medium tabular-nums", TONE[label])}
    >
      Data confidence: {label} ({score}%)
    </span>
  )
}
