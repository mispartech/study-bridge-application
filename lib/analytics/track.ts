import { ANALYTICS_ID_KEY, hasAnalyticsConsent } from "./consent"

// PostHog's capture endpoint, called directly: its browser library is too heavy for slow 3G.
// Events carry a random browser id and no personal data, and are sent only after consent.

function browserId() {
  try {
    const known = localStorage.getItem(ANALYTICS_ID_KEY)
    if (known) return known
    const id = crypto.randomUUID()
    localStorage.setItem(ANALYTICS_ID_KEY, id)
    return id
  } catch {
    return "anonymous"
  }
}

export type FunnelEvent =
  | "landing_quick_match"
  | `onboarding_step_${number}`
  | "results_viewed"
  | "programme_saved"
  | "apply_clicked"
  | "plus_checkout_started"

export function track(event: FunnelEvent, properties: Record<string, string | number> = {}) {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  // This check comes first, so without consent no id is created either.
  if (!key || !hasAnalyticsConsent()) return
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com"
  const body = JSON.stringify({ api_key: key, event, distinct_id: browserId(), properties })
  void fetch(`${host}/capture/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined)
}
