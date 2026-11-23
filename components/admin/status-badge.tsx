import type * as React from "react"

import { cn } from "@/lib/utils"

export type Tone = "neutral" | "info" | "success" | "warning" | "danger"

const TONE: Record<Tone, string> = {
  neutral: "bg-surface-subtle text-ink",
  info: "bg-primary-tint text-primary-strong",
  success: "bg-success-tint text-success-strong",
  warning: "bg-warning-tint text-warning-strong",
  danger: "bg-danger-tint text-danger-strong",
}

/** A short status word in a pill. The word carries the meaning; the colour only backs it up. */
export function StatusBadge({
  tone = "neutral",
  children,
  className,
  ...props
}: { tone?: Tone; children: React.ReactNode; className?: string } & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      data-slot="status-badge"
      className={cn(
        "inline-flex h-6 shrink-0 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap",
        TONE[tone],
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}

/** Tones for the statuses the admin shows today. Unknown values stay neutral. */
export function toneFor(status: string): Tone {
  switch (status) {
    case "ok":
    case "sent":
    case "paid":
    case "approved":
    case "active":
    case "set":
      return "success"
    case "pending":
    case "queued":
    case "open":
      return "warning"
    case "failed":
    case "rejected":
    case "suspended":
    case "missing":
    case "refunded":
      return "danger"
    default:
      return "neutral"
  }
}
