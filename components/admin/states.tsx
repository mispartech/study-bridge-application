import type * as React from "react"
import { CircleAlert, Inbox } from "lucide-react"

import { cn } from "@/lib/utils"

/** Nothing to show, said plainly, with an optional next step. */
export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center gap-2 rounded-card border border-dashed border-border px-4 py-8 text-center",
        className
      )}
    >
      <Inbox className="size-6 text-muted-foreground" aria-hidden />
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-md text-sm text-muted-foreground">{description}</p>}
      {action}
    </div>
  )
}

/** A load or save that failed. The message comes from our own code, never a raw stack. */
export function ErrorState({ title = "Something went wrong", message }: { title?: string; message?: string }) {
  return (
    <div
      role="alert"
      data-slot="error-state"
      className="flex items-start gap-2 rounded-card bg-danger-tint p-4 text-sm text-danger-strong"
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        <strong>{title}.</strong> {message}
      </p>
    </div>
  )
}

/** Placeholder blocks while a section streams in. */
export function LoadingSkeleton({ rows = 3, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} data-slot="loading-skeleton" className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-admin-row animate-pulse rounded-button bg-surface-subtle" />
      ))}
      <span className="sr-only">{label}…</span>
    </div>
  )
}
