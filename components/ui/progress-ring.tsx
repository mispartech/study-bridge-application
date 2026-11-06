import * as React from "react"

import { cn } from "@/lib/utils"

export type RingTone = "primary" | "success" | "warning" | "danger" | "neutral"

// Strong shades: the base success/warning hues fall below 3:1 against white as strokes.
const TONE_STROKE: Record<RingTone, string> = {
  primary: "stroke-primary",
  success: "stroke-success-strong",
  warning: "stroke-warning-strong",
  danger: "stroke-danger-strong",
  neutral: "stroke-muted-foreground",
}

export function clampPercent(value: number, max = 100): number {
  if (!Number.isFinite(value) || max <= 0) return 0
  return Math.min(100, Math.max(0, (value / max) * 100))
}

type ProgressRingProps = Omit<React.ComponentProps<"div">, "children"> & {
  value: number
  max?: number
  /** Diameter in px. */
  size?: number
  strokeWidth?: number
  tone?: RingTone
  /** Accessible name, e.g. "Application checklist". */
  label: string
  /** Content in the centre; defaults to the rounded percentage. */
  children?: React.ReactNode
}

/** SVG ring with a CSS transition (no JS animation), so it costs nothing on slow devices. */
function ProgressRing({
  value,
  max = 100,
  size = 64,
  strokeWidth = 6,
  tone = "primary",
  label,
  className,
  children,
  ...props
}: ProgressRingProps) {
  const percent = clampPercent(value, max)
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(max, Math.max(0, value))}
      data-slot="progress-ring"
      className={cn("relative inline-grid shrink-0 place-items-center", className)}
      style={{ width: size, height: size }}
      {...props}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} className="stroke-track" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - percent / 100)}
          className={cn("transition-[stroke-dashoffset] duration-700 ease-out", TONE_STROKE[tone])}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center money text-sm font-semibold" aria-hidden>
        {children ?? `${Math.round(percent)}%`}
      </span>
    </div>
  )
}

export { ProgressRing, type ProgressRingProps }
