/** Marks a figure that hasn't been confirmed from a government or university source. */
export function EstimatedTag() {
  return (
    <span
      data-testid="estimated-tag"
      className="rounded-full bg-warning-tint px-2 py-0.5 text-xs font-medium text-warning-strong"
    >
      Estimated
    </span>
  )
}

/** For totals that contain estimated lines. */
export function IncludesEstimates() {
  return <span className="text-xs text-muted-foreground">Includes estimated visa, health and flight figures</span>
}
