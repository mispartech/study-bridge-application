import "server-only"

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
const TIMEOUT_MS = 4000

/** Off until TURNSTILE_SECRET_KEY is set, like the widget, which is off until its site key is set. */
export const turnstileRequired = () => Boolean(process.env.TURNSTILE_SECRET_KEY)

/**
 * Checks a Turnstile token with Cloudflare. A missing or rejected token fails. If Cloudflare can't be reached,
 * the request is allowed and logged: rate limits still apply, and an outage there must not take StudyBridge down.
 */
export async function verifyTurnstile(token: unknown, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return true
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) return false
  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      body: new URLSearchParams({ secret, response: token, ...(ip !== "unknown" && { remoteip: ip }) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const body = (await res.json()) as { success?: boolean }
    return body.success === true
  } catch (err) {
    console.error("Turnstile unreachable; allowing:", err instanceof Error ? err.message : err)
    return true
  }
}
