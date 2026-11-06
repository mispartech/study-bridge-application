import { ProgressRing, type RingTone } from "@/components/ui/progress-ring"
import { cn } from "@/lib/utils"

export type FitBand = "strong" | "good" | "reach"

const BAND: Record<FitBand, { tone: RingTone; label: string }> = {
  strong: { tone: "success", label: "Strong" },
  good: { tone: "primary", label: "Good" },
  reach: { tone: "warning", label: "Reach" },
}

type FitRingProps = {
  /** Fit score 0–100 from fitScore(); values outside the range are clamped. */
  score: number
  /**
   * Band from rank(). Passed in rather than derived here so the ring can never disagree
   * with the matching engine's grouping.
   */
  band?: FitBand
  size?: "sm" | "md" | "lg"
  /** Show the band name under the ring. */
  showLabel?: boolean
  className?: string
}

const SIZE = {
  sm: { px: 44, stroke: 4, text: "text-xs" },
  md: { px: 64, stroke: 6, text: "text-base" },
  lg: { px: 96, stroke: 8, text: "text-2xl" },
}

function FitRing({ score, band, size = "md", showLabel = false, className }: FitRingProps) {
  const value = Math.round(Math.min(100, Math.max(0, Number.isFinite(score) ? score : 0)))
  const s = SIZE[size]
  const bandInfo = band ? BAND[band] : undefined

  return (
    <div className={cn("inline-flex flex-col items-center gap-1", className)} data-slot="fit-ring" data-band={band}>
      <ProgressRing
        value={value}
        size={s.px}
        strokeWidth={s.stroke}
        tone={bandInfo?.tone ?? "primary"}
        label={`Fit score${bandInfo ? `, ${bandInfo.label} match` : ""}`}
        aria-valuetext={`${value} out of 100${bandInfo ? `, ${bandInfo.label} match` : ""}`}
      >
        <span className={cn("font-heading font-bold", s.text)}>{value}</span>
      </ProgressRing>
      {showLabel && bandInfo && (
        <span className="text-xs font-medium text-muted-foreground" aria-hidden>
          {bandInfo.label}
        </span>
      )}
    </div>
  )
}

export { FitRing, type FitRingProps }
