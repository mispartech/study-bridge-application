/**
 * How far a student can rely on the facts behind a result, 0-100. It looks at where the facts came from,
 * how recently they were checked, and how many cost lines are estimates. It never mentions the model.
 */

const DAY_MS = 86_400_000

const ESTIMATED = 45

const SOURCE_SCORE: Record<string, number> = {
  official: 100,
  university_page: 95,
  third_party: 65,
  estimated: ESTIMATED,
}

export type ConfidenceLabel = "High" | "Medium" | "Low"

export const confidenceLabel = (score: number): ConfidenceLabel =>
  score >= 80 ? "High" : score >= 55 ? "Medium" : "Low"

export function dataConfidence(input: {
  source: string
  lastVerifiedAt: string
  costLines: { estimated: boolean }[]
  now: Date
}): number {
  const base = SOURCE_SCORE[input.source] ?? ESTIMATED
  const ageDays = (input.now.getTime() - new Date(input.lastVerifiedAt).getTime()) / DAY_MS
  const stale = ageDays <= 90 ? 0 : ageDays <= 180 ? 10 : ageDays <= 365 ? 25 : 40
  const lines = input.costLines.length
  const estimates = lines === 0 ? 0 : Math.round((20 * input.costLines.filter((l) => l.estimated).length) / lines)
  return Math.max(0, Math.min(100, base - stale - estimates))
}

/** The search's overall score: how complete the profile is and how reliable the top results are. */
export function searchConfidence(profileScore: number | null, dataScore: number | null): number | null {
  if (profileScore === null) return dataScore
  if (dataScore === null) return profileScore
  return Math.round((profileScore + dataScore) / 2)
}

/** Average data confidence of the results a student sees first. */
export function averageConfidence(scores: number[], top = 10): number | null {
  const first = scores.slice(0, top)
  return first.length ? Math.round(first.reduce((a, b) => a + b, 0) / first.length) : null
}
