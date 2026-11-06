// Fixed reference time for demo pages. Keeps them static (Cache Components treats
// `new Date()` as request-time data) and keeps screenshots and tests deterministic.
export const DEMO_NOW = new Date("2026-11-02T12:00:00Z")

export function daysBefore(days: number): Date {
  return new Date(DEMO_NOW.getTime() - days * 24 * 60 * 60 * 1000)
}
