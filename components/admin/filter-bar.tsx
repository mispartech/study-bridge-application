import Link from "next/link"
import type * as React from "react"
import { X } from "lucide-react"

export type FilterChip = { label: string; removeHref: string }

/**
 * Holds a page's filters (the date range, search forms), the active filters as removable chips, and a
 * reset. All state lives in the URL, so a filtered view can be shared or bookmarked.
 */
export function FilterBar({
  children,
  chips = [],
  resetHref,
}: {
  children: React.ReactNode
  chips?: FilterChip[]
  resetHref?: string
}) {
  return (
    <section
      aria-label="Filters"
      data-slot="filter-bar"
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-3 sm:p-4"
    >
      {children}
      {(chips.length > 0 || resetHref) && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {chips.map((c) => (
            <Link
              key={c.label}
              href={c.removeHref}
              className="inline-flex min-h-8 items-center gap-1 rounded-full bg-primary-tint px-3 font-medium text-primary-strong"
            >
              {c.label}
              <X className="size-3.5" aria-hidden />
              <span className="sr-only">(remove)</span>
            </Link>
          ))}
          {resetHref && chips.length > 0 && (
            <Link href={resetHref} className="font-medium underline underline-offset-4">
              Reset
            </Link>
          )}
        </div>
      )}
    </section>
  )
}
