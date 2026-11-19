// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { clientEvent, CLIENT_EVENTS, EVENT_SCHEMAS, validProperties } from "./events"
import { userAgentFamily } from "./record"

describe("activity events", () => {
  it("accepts a known reason and refuses free text", () => {
    expect(validProperties("programme_dismissed", { reason: "too_expensive" }).success).toBe(true)
    expect(validProperties("programme_dismissed", { reason: "my landlord is Mr Bello" }).success).toBe(false)
  })

  it("refuses properties an event doesn't define, so personal data can't ride along", () => {
    expect(validProperties("apply_clicked", { email: "a@b.com" }).success).toBe(false)
    expect(validProperties("advisor_thumbs", { up: false, reason: "wrong", note: "hi" }).success).toBe(false)
  })

  it("lets a browser send only browser events", () => {
    const ok = clientEvent.safeParse({
      event: "apply_clicked",
      target_type: "programme",
      target_id: crypto.randomUUID(),
    })
    expect(ok.success).toBe(true)
    expect(clientEvent.safeParse({ event: "account_deleted" }).success).toBe(false)
    expect(clientEvent.safeParse({ event: "plus_paid" }).success).toBe(false)
    expect(clientEvent.safeParse({ event: "apply_clicked", target_id: "<script>" }).success).toBe(false)
  })

  it("has a schema for every browser event", () => {
    for (const e of CLIENT_EVENTS) expect(EVENT_SCHEMAS[e]).toBeDefined()
  })

  it("keeps only the browser family, never the full user agent", () => {
    expect(
      userAgentFamily("Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36")
    ).toBe("Chrome")
    expect(userAgentFamily("Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1")).toBe(
      "Safari"
    )
    expect(userAgentFamily(null)).toBeNull()
  })
})
