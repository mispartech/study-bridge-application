import { z } from "zod"

/**
 * Goals and pathways (docs/CANADA_V1_PLAN.md, step B). Which goals exist and how much each signal counts are
 * data, managed in the admin; this file only knows what each signal means and how to combine them.
 *
 * Every signal is computed per programme from reviewed records for that programme's country, so a pathway
 * works the same for UK, Canadian and any later routes. A signal with no data yet is left out of the sum,
 * never counted as zero.
 */

export const SIGNALS = {
  field_match: {
    label: "Matches your course",
    description: "The programme is in the field you chose.",
    available: true,
  },
  placement: {
    label: "Work placement or co-op",
    description: "The programme includes a placement, co-op or internship (or US STEM designation).",
    available: true,
  },
  post_study_work: {
    label: "Work rights after study",
    description: "How long you can stay and work after graduating, from the destination's visa rules.",
    available: true,
  },
  funding: {
    label: "Funding you can apply for",
    description: "Scholarships open to you on this programme, against half a year's tuition.",
    available: true,
  },
  work_permit_route: {
    label: "Leads to a work permit",
    description: "The programme's field and institution qualify for a post-study work permit.",
    available: false,
  },
  in_demand: {
    label: "In-demand career",
    description: "The programme leads to an occupation the region is short of.",
    available: false,
  },
  licensing_path: {
    label: "Route to a licence",
    description: "There is a known licensing path for the profession it leads to.",
    available: false,
  },
  research: {
    label: "Research-focused",
    description: "A research degree or a research-intensive department.",
    available: false,
  },
  entrepreneurship: {
    label: "Support for founders",
    description: "Start-up support, an incubator or an entrepreneurship track.",
    available: false,
  },
} as const

export type SignalKey = keyof typeof SIGNALS
export const SIGNAL_KEYS = Object.keys(SIGNALS) as SignalKey[]

export const pathwayKey = z.string().regex(/^[a-z][a-z_]{1,39}$/)

export const pathwaySchema = z.object({
  key: pathwayKey,
  label: z.string().trim().min(2).max(60),
  description: z.string().trim().max(280),
  active: z.boolean(),
  sort_order: z.number().int().min(0).max(1000),
  signals: z.partialRecord(z.enum(SIGNAL_KEYS as [SignalKey, ...SignalKey[]]), z.number().int().min(0).max(100)),
})

export type Pathway = z.infer<typeof pathwaySchema>

/** Values between 0 and 1, or null where the data isn't there yet for this programme. */
export type SignalValues = Partial<Record<SignalKey, number | null>>

/** How much a signal must contribute, as a share of a goal's score, to be named as a reason. */
const REASON_SHARE = 0.2

/**
 * Career fit for the goals a student chose: each goal is the weighted average of the signals it uses (only
 * those with data), and the goals are averaged. Also names the signals that raised the score most, for the
 * "ranked up for your goals" line. Null when no chosen goal is known or none of its signals has data, so the
 * caller can fall back to the default career fit.
 */
export function goalFit(
  values: SignalValues,
  pathways: readonly Pathway[],
  goals: readonly string[]
): { score: number; reasons: SignalKey[] } | null {
  const chosen = pathways.filter((p) => p.active && goals.includes(p.key))
  const contributions = new Map<SignalKey, number>()
  const scores: number[] = []
  for (const pathway of chosen) {
    let num = 0
    let den = 0
    const parts: [SignalKey, number][] = []
    for (const [signal, weight] of Object.entries(pathway.signals) as [SignalKey, number][]) {
      const value = values[signal]
      if (value === null || value === undefined || weight === 0) continue
      num += weight * value
      den += weight
      parts.push([signal, weight * value])
    }
    if (den === 0) continue
    scores.push(num / den)
    for (const [signal, part] of parts) {
      contributions.set(signal, Math.max(contributions.get(signal) ?? 0, part / den))
    }
  }
  if (scores.length === 0) return null
  const reasons = [...contributions]
    .filter(([signal, share]) => share >= REASON_SHARE && signal !== "field_match")
    .sort((a, b) => b[1] - a[1])
    .map(([signal]) => signal)
  return { score: scores.reduce((a, b) => a + b, 0) / scores.length, reasons }
}
