import type * as React from "react"
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"

import { formatChange, type Change } from "@/lib/admin/change"
import { cn } from "@/lib/utils"

/**
 * One headline number. `change` (against the previous period) shows an arrow, the % and a colour meaning good
 * or bad for this metric; the words say it too, so colour is never the only signal.
 */
export function KpiTile({
  label,
  value,
  detail,
  change,
  sparkline,
  testId,
  headingLevel: H = "h2",
}: {
  label: string
  value: React.ReactNode
  detail?: React.ReactNode
  change?: Change
  sparkline?: React.ReactNode
  testId?: string
  headingLevel?: "h2" | "h3"
}) {
  const Icon =
    !change || change.direction === "flat" ? Minus : change.direction === "up" ? ArrowUpRight : ArrowDownRight
  return (
    <div data-slot="kpi-tile" className="flex flex-col gap-1 rounded-card border border-border bg-surface p-4">
      <H className="text-sm font-normal text-muted-foreground">{label}</H>
      <p data-testid={testId} className="font-heading text-2xl font-extrabold tabular-nums">
        {value}
      </p>
      {change && (
        <p
          className={cn(
            "inline-flex items-center gap-1 text-xs font-medium tabular-nums",
            change.good === true && "text-success-strong",
            change.good === false && "text-danger-strong",
            change.good === null && "text-muted-foreground"
          )}
        >
          <Icon className="size-3.5" aria-hidden />
          {formatChange(change)}
          <span className="font-normal text-muted-foreground">vs previous period</span>
        </p>
      )}
      {detail && <div className="text-xs text-muted-foreground tabular-nums">{detail}</div>}
      {sparkline && <div className="mt-1 h-8">{sparkline}</div>}
    </div>
  )
}

/** A responsive row of tiles. */
export function KpiGrid({ children, columns = 4 }: { children: React.ReactNode; columns?: 2 | 3 | 4 }) {
  return (
    <section
      className={cn("grid gap-3 sm:grid-cols-2", columns === 3 && "lg:grid-cols-3", columns === 4 && "lg:grid-cols-4")}
    >
      {children}
    </section>
  )
}
