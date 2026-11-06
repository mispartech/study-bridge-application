/** Records verified fewer than this many days ago count as fresh (green). */
export const FRESH_DAYS = 90

const DAY_MS = 24 * 60 * 60 * 1000

export type Freshness = {
  status: "fresh" | "aging"
  /** Whole days since verification; 0 for anything under 24 hours (or a future date). */
  days: number
}

export function getFreshness(lastVerifiedAt: Date | string, now: Date): Freshness {
  const verified = typeof lastVerifiedAt === "string" ? new Date(lastVerifiedAt) : lastVerifiedAt
  if (Number.isNaN(verified.getTime())) throw new RangeError(`Invalid lastVerifiedAt: ${String(lastVerifiedAt)}`)

  const days = Math.max(0, Math.floor((now.getTime() - verified.getTime()) / DAY_MS))
  return { status: days < FRESH_DAYS ? "fresh" : "aging", days }
}

export function describeAge(days: number): string {
  if (days === 0) return "today"
  if (days === 1) return "yesterday"
  if (days < 60) return `${days} days ago`
  const months = Math.floor(days / 30)
  if (days < 730) return `${months} months ago`
  return `${Math.floor(days / 365)} years ago`
}
