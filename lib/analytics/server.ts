import "server-only"

import { createHash } from "node:crypto"

/** A funnel event from the server. The user id is hashed, so PostHog never holds it. Never throws. */
export async function captureServer(event: string, userId: string) {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key) return
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com"
  await fetch(`${host}/capture/`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: key,
      event,
      distinct_id: createHash("sha256").update(userId).digest("hex"),
    }),
  }).catch(() => undefined)
}
