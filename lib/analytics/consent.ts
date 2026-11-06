// Analytics stay off until a student consents. The server sets this cookie only once consent is on
// record, and until then nothing is sent and nothing is stored in the browser.

export const ANALYTICS_COOKIE = "sb-analytics"
export const ANALYTICS_ID_KEY = "sb-analytics-id"

export const hasAnalyticsConsent = () =>
  typeof document !== "undefined" && document.cookie.split("; ").includes(`${ANALYTICS_COOKIE}=1`)

/** For sign-out and account deletion: the next person on this device hasn't consented. */
export function clearAnalytics() {
  document.cookie = `${ANALYTICS_COOKIE}=; path=/; max-age=0; samesite=lax`
  try {
    localStorage.removeItem(ANALYTICS_ID_KEY)
  } catch {
    // Nothing was stored, then.
  }
}
