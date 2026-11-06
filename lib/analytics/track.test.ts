import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ANALYTICS_COOKIE, ANALYTICS_ID_KEY, clearAnalytics, hasAnalyticsConsent } from "./consent"
import { track } from "./track"

const send = vi.fn(async () => new Response("{}"))

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test")
  vi.stubGlobal("fetch", send)
  send.mockClear()
  localStorage.clear()
  clearAnalytics()
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const consent = () => {
  document.cookie = `${ANALYTICS_COOKIE}=1; path=/`
}

describe("analytics consent", () => {
  it("sends nothing and stores nothing before consent", () => {
    track("landing_quick_match")
    expect(send).not.toHaveBeenCalled()
    expect(localStorage.length).toBe(0)
  })

  it("sends a random id, and no personal data, after consent", () => {
    consent()
    track("results_viewed")
    expect(send).toHaveBeenCalledTimes(1)
    const [, init] = send.mock.calls[0] as unknown as [string, { body: string }]
    const body = JSON.parse(init.body) as { event: string; distinct_id: string }
    expect(body.event).toBe("results_viewed")
    expect(body.distinct_id).toBe(localStorage.getItem(ANALYTICS_ID_KEY))
    expect(Object.keys(body).sort()).toEqual(["api_key", "distinct_id", "event", "properties"])
  })

  it("isn't fooled by another cookie with a similar name", () => {
    document.cookie = `${ANALYTICS_COOKIE}-old=1; path=/`
    expect(hasAnalyticsConsent()).toBe(false)
    document.cookie = `${ANALYTICS_COOKIE}-old=; path=/; max-age=0`
  })

  it("stops, and forgets the id, after sign-out", () => {
    consent()
    track("results_viewed")
    expect(localStorage.getItem(ANALYTICS_ID_KEY)).toBeTruthy()
    clearAnalytics()
    send.mockClear()
    track("results_viewed")
    expect(send).not.toHaveBeenCalled()
    expect(localStorage.getItem(ANALYTICS_ID_KEY)).toBeNull()
  })

  it("sends nothing without a PostHog key, even after consent", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "")
    consent()
    track("results_viewed")
    expect(send).not.toHaveBeenCalled()
  })
})
