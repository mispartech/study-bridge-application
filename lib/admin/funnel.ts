/** The journey from first search to payment (docs/SPEC_ACCESS_ADMIN.md, section 5). */
export const FUNNEL = [
  { key: "quick_match_run", label: "Ran a quick match" },
  { key: "wizard_completed", label: "Finished the wizard" },
  { key: "results_viewed", label: "Saw full results" },
  { key: "report_or_account", label: "Emailed a report or made an account" },
  { key: "programme_saved", label: "Saved a programme" },
  { key: "apply_clicked", label: "Clicked an official apply link" },
  { key: "plus_paid", label: "Paid for Plus" },
] as const

export type Summary = { event: string; events: number; actors: number }[]
export type FunnelStep = { key: string; label: string; people: number; fromPrevious: number | null }

/** People at each step (distinct actors) and the share of the previous step who got there. */
export function funnel(summary: Summary): FunnelStep[] {
  const people = (event: string) => summary.find((s) => s.event === event)?.actors ?? 0
  return FUNNEL.map((step, i) => {
    const count =
      step.key === "report_or_account" ? people("report_emailed") + people("account_created") : people(step.key)
    return { key: step.key, label: step.label, people: count, fromPrevious: null as number | null, index: i }
  }).map((step, i, all) => ({
    key: step.key,
    label: step.label,
    people: step.people,
    fromPrevious: i === 0 || all[i - 1]!.people === 0 ? null : step.people / all[i - 1]!.people,
  }))
}

export const count = (summary: Summary, event: string) => summary.find((s) => s.event === event)?.events ?? 0
