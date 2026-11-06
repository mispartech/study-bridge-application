/** Shown on every page while demo records are in play, so nobody takes them for real programmes. */
export function DemoBanner() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") return null
  return (
    <div
      data-testid="demo-banner"
      role="note"
      className="relative z-50 bg-warning-tint px-4 py-1 text-center text-sm font-medium text-warning-strong"
    >
      Demo data — not real programmes
    </div>
  )
}
