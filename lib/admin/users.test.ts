import { describe, expect, it } from "vitest"

import { estimateCostUsd } from "@/lib/settings/schema"

import { formatUsd, summariseUsers, totals, type UsageRow } from "./users"

const now = new Date("2026-11-14T12:00:00Z")
const prices = { "google:gemini-3.6-flash": { input: 0.5, output: 3 } }
const call = (user_id: string | null, input: number, output: number, success = true): UsageRow => ({
  user_id,
  provider: "google",
  model: "gemini-3.6-flash",
  input_tokens: input,
  output_tokens: output,
  success,
})

describe("AI cost", () => {
  it("prices tokens per million", () => {
    expect(estimateCostUsd(prices, "google", "gemini-3.6-flash", 1_000_000, 1_000_000)).toBe(3.5)
    expect(estimateCostUsd(prices, "anthropic", "claude-haiku-5-5", 10, 10)).toBeNull()
  })

  it("adds up calls, failures, tokens and cost", () => {
    expect(totals([call("a", 2_000_000, 0), call("a", 0, 1_000_000, false)], prices)).toEqual({
      ai_calls: 2,
      ai_failures: 1,
      input_tokens: 2_000_000,
      output_tokens: 1_000_000,
      cost_usd: 4,
    })
  })

  it("says the cost is unknown when any model has no price", () => {
    const unpriced = { ...call("a", 10, 10), provider: "anthropic", model: "claude-haiku-5-5" }
    expect(totals([call("a", 10, 10), unpriced], prices).cost_usd).toBeNull()
    expect(formatUsd(null)).toBe("price not set")
    expect(formatUsd(0.001)).toBe("< $0.01")
    expect(formatUsd(1.234)).toBe("$1.23")
  })
})

describe("users summary", () => {
  it("joins accounts with usage, searches and plan, most recently active first", () => {
    const rows = summariseUsers(
      [
        { id: "a", email: "a@x.com", created_at: "2026-11-01T00:00:00Z", last_sign_in_at: "2026-11-02T00:00:00Z" },
        {
          id: "b",
          email: "b@x.com",
          created_at: "2026-11-01T00:00:00Z",
          last_sign_in_at: "2026-11-10T00:00:00Z",
          app_metadata: { role: "admin" },
        },
      ],
      [call("a", 1_000_000, 0), call(null, 5, 5)],
      [{ user_id: "a" }, { user_id: "a" }, { user_id: null }],
      [
        { user_id: "a", plan: "plus", current_period_end: "2027-01-01T00:00:00Z" },
        { user_id: "b", plan: "plus", current_period_end: "2026-11-01T00:00:00Z" },
      ],
      prices,
      now
    )
    expect(rows.map((r) => r.id)).toEqual(["b", "a"])
    expect(rows[1]).toMatchObject({ searches: 2, ai_calls: 1, cost_usd: 0.5, plan: "plus", admin: false })
    expect(rows[0]).toMatchObject({ searches: 0, ai_calls: 0, plan: "free", admin: true })
  })
})
