import type { DEFAULT_WEIGHTS } from "./types"

export type Weights = typeof DEFAULT_WEIGHTS
export type WeightKey = keyof Weights

export const WEIGHT_LABELS: Record<WeightKey, string> = {
  A: "Grades",
  B: "Budget",
  C: "Career",
  L: "Location",
  S: "Scholarships",
  O: "Outcomes",
}

/** Sets one weight and scales the others to keep the total at exactly 100. */
export function rebalance(weights: Weights, key: WeightKey, value: number): Weights {
  const target = Math.max(0, Math.min(100, Math.round(value)))
  const others = (Object.keys(weights) as WeightKey[]).filter((k) => k !== key)
  const remaining = 100 - target
  const current = others.reduce((sum, k) => sum + weights[k], 0)
  const exact = others.map((k) => ({
    k,
    share: current === 0 ? remaining / others.length : (weights[k] / current) * remaining,
  }))
  const next = { ...weights, [key]: target }
  for (const { k, share } of exact) next[k] = Math.floor(share)
  // Hand out what rounding down lost, largest remainder first.
  let left = remaining - others.reduce((sum, k) => sum + next[k], 0)
  for (const { k } of exact.sort((a, b) => b.share - Math.floor(b.share) - (a.share - Math.floor(a.share)))) {
    if (left-- <= 0) break
    next[k] += 1
  }
  return next
}
