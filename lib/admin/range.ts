/** Date ranges for admin pages: a preset (today, 7, 30 or 90 days) or custom dates. Lagos days. */
export const PRESETS = { today: 1, "7d": 7, "30d": 30, "90d": 90 } as const
export type Preset = keyof typeof PRESETS
export type Range = { from: Date; to: Date; label: string; preset: Preset | null; query: string }

const DAY_MS = 86_400_000
const LAGOS_OFFSET_MS = 3_600_000
const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Midnight Lagos time at the start of the day containing `at`. */
export function lagosMidnight(at: Date): Date {
  const local = at.getTime() + LAGOS_OFFSET_MS
  return new Date(local - (local % DAY_MS) - LAGOS_OFFSET_MS)
}

export function presetRange(preset: Preset, now: Date): Range {
  // To the end of today, not "now": rows written moments ago must show even if this server's clock lags the DB's.
  const to = new Date(lagosMidnight(now).getTime() + DAY_MS)
  const from = new Date(lagosMidnight(now).getTime() - (PRESETS[preset] - 1) * DAY_MS)
  const label = preset === "today" ? "Today" : `Last ${PRESETS[preset]} days`
  return { from, to, label, preset, query: `range=${preset}` }
}

/** Reads ?range= or ?from=&to= (YYYY-MM-DD). Anything invalid falls back to the last 30 days. */
export function parseRange(params: { range?: string; from?: string; to?: string }, now: Date): Range {
  if (params.from && params.to && DATE.test(params.from) && DATE.test(params.to) && params.from <= params.to) {
    const from = new Date(`${params.from}T00:00:00+01:00`)
    const to = new Date(new Date(`${params.to}T00:00:00+01:00`).getTime() + DAY_MS)
    return {
      from,
      to,
      label: `${params.from} to ${params.to}`,
      preset: null,
      query: `from=${params.from}&to=${params.to}`,
    }
  }
  const preset = (Object.keys(PRESETS) as Preset[]).find((p) => p === params.range) ?? "30d"
  return presetRange(preset, now)
}
