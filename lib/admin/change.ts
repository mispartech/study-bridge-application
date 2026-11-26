/** Change against the previous equal period, for KPI tiles. */
export type Change = {
  /** Fraction (0.25 = +25%), or null when there is nothing to compare with. */
  ratio: number | null
  direction: "up" | "down" | "flat"
  /** Whether the change is good news for this metric. Null when flat or unknown. */
  good: boolean | null
}

/**
 * `better` says which way is good: more accounts is good ("up"), more errors is bad ("down"). A previous
 * value of zero has no percentage, but going from 0 to something is still "up".
 */
export function change(current: number | null, previous: number | null, better: "up" | "down" = "up"): Change {
  if (current === null || previous === null) return { ratio: null, direction: "flat", good: null }
  const direction = current > previous ? "up" : current < previous ? "down" : "flat"
  const ratio = previous === 0 ? null : (current - previous) / previous
  return { ratio, direction, good: direction === "flat" ? null : direction === better }
}

export function formatChange(c: Change): string {
  if (c.direction === "flat") return "No change"
  if (c.ratio === null) return c.direction === "up" ? "Up from zero" : "Down"
  const pct = Math.round(Math.abs(c.ratio) * 100)
  return `${c.direction === "up" ? "+" : "−"}${pct}%`
}
