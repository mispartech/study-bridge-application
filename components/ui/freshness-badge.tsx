import { CircleAlert, CircleCheck } from "lucide-react"

import { Chip } from "@/components/ui/chip"
import { describeAge, getFreshness } from "@/lib/freshness"
import { cn } from "@/lib/utils"

type FreshnessBadgeProps = {
  lastVerifiedAt: Date | string
  /**
   * Reference time. Required rather than defaulting to `new Date()` so the badge stays a
   * pure server component: with Cache Components, read the time at request time
   * (after `await connection()`) in the caller and pass it down.
   */
  now: Date
  /** When given, the badge links to the official page the record was verified against. */
  sourceUrl?: string
  size?: "sm" | "md"
  className?: string
}

function FreshnessBadge({ lastVerifiedAt, now, sourceUrl, size = "md", className }: FreshnessBadgeProps) {
  const { status, days } = getFreshness(lastVerifiedAt, now)
  const verified = new Date(lastVerifiedAt)
  const fresh = status === "fresh"
  const Icon = fresh ? CircleCheck : CircleAlert
  const exactDate = verified.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  })

  const chip = (
    <Chip
      variant={fresh ? "success" : "warning"}
      size={size}
      icon={<Icon aria-hidden />}
      data-freshness={status}
      title={`Last verified ${exactDate}${fresh ? "" : ". Details may have changed; check the official page."}`}
    >
      Verified <time dateTime={verified.toISOString()}>{describeAge(days)}</time>
      {!fresh && <span className="sr-only">. Details may have changed; check the official page.</span>}
    </Chip>
  )

  if (!sourceUrl) return <span className={cn("inline-flex", className)}>{chip}</span>

  return (
    <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className={cn("inline-flex rounded-full", className)}>
      {chip}
      <span className="sr-only"> (opens official source in a new tab)</span>
    </a>
  )
}

export { FreshnessBadge, type FreshnessBadgeProps }
