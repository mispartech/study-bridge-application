// @vitest-environment node
import { createHmac } from "node:crypto"

import { describe, expect, it } from "vitest"

import { paystackKey, PLUS, PLUS_ENDS, plusOnSale, settles, validSignature } from "@/lib/billing/paystack"

import { changeReminders, daysUntil, deadlineReminders, timeline, type WatchedProgramme } from "./reminders"

const NOW = new Date("2026-11-05T12:00:00Z")
const watched = (date: string, stage = "researching"): WatchedProgramme => ({
  user_id: "u1",
  programme_id: "p1",
  title: "MSc Data Analytics",
  stage,
  deadlines: [{ label: "international", date }],
})

describe("deadline reminders", () => {
  it.each([
    ["2026-12-05", 1],
    ["2026-11-19", 1],
    ["2026-11-08", 1],
    ["2026-11-09", 0],
    ["2026-11-04", 0],
  ])("%s gives %i reminder", (date, count) => {
    expect(deadlineReminders([watched(date)], NOW)).toHaveLength(count)
  })

  it("gives each reminder its own key, so a re-run can't repeat it", () => {
    const [thirty] = deadlineReminders([watched("2026-12-05")], NOW)
    const [fourteen] = deadlineReminders([watched("2026-11-19")], NOW)
    expect(thirty!.dedupe_key).not.toBe(fourteen!.dedupe_key)
    expect(deadlineReminders([watched("2026-12-05")], NOW)[0]!.dedupe_key).toBe(thirty!.dedupe_key)
  })

  it("stops once the student has applied", () => {
    expect(deadlineReminders([watched("2026-12-05", "applied")], NOW)).toEqual([])
  })

  it("counts days in Lagos, not UTC", () => {
    expect(daysUntil("2026-11-06", new Date("2026-11-05T23:30:00Z"))).toBe(0)
  })
})

describe("record change alerts", () => {
  it("reach only students who saved that programme", () => {
    const other = { ...watched("2026-12-05"), user_id: "u2", programme_id: "p2" }
    const alerts = changeReminders([watched("2026-12-05"), other], [{ audit_id: "a1", programme_id: "p1" }])
    expect(alerts.map((a) => a.user_id)).toEqual(["u1"])
  })
})

describe("timeline", () => {
  it("sorts upcoming deadlines and drops past ones", () => {
    const items = [
      { programme_id: "p1", title: "A", deadlines: [{ label: "x", date: "2027-02-01" }] },
      {
        programme_id: "p2",
        title: "B",
        deadlines: [
          { label: "y", date: "2027-01-01" },
          { label: "z", date: "2026-01-01" },
        ],
      },
    ]
    expect(timeline(items, NOW).map((d) => d.title)).toEqual(["B", "A"])
  })
})

describe("Paystack", () => {
  const key = "sk_test_abc"
  const pending = { amount_minor: PLUS.amount_minor, currency: PLUS.currency, status: "pending" }
  const charge = { reference: "r", amount: PLUS.amount_minor, currency: PLUS.currency, status: "success" }

  it("refuses a live key", () => {
    expect(paystackKey({ PAYSTACK_SECRET_KEY: "sk_live_abc" })).toBeNull()
    expect(paystackKey({})).toBeNull()
    expect(paystackKey({ PAYSTACK_SECRET_KEY: key })).toBe(key)
  })

  it("accepts only a body signed with our key", () => {
    const body = '{"event":"charge.success"}'
    const signature = createHmac("sha512", key).update(body).digest("hex")
    expect(validSignature(body, signature, key)).toBe(true)
    expect(validSignature(`${body} `, signature, key)).toBe(false)
    expect(validSignature(body, "short", key)).toBe(false)
    expect(validSignature(body, null, key)).toBe(false)
  })

  it("settles only the exact amount, once", () => {
    expect(settles(pending, charge)).toBe(true)
    expect(settles(pending, { ...charge, amount: 100 })).toBe(false)
    expect(settles(pending, { ...charge, currency: "USD" })).toBe(false)
    expect(settles(pending, { ...charge, status: "failed" })).toBe(false)
    expect(settles({ ...pending, status: "paid" }, charge)).toBe(false)
  })

  it("is one payment for the cycle, valid to the last day in Lagos", () => {
    expect(PLUS).toMatchObject({ amount_minor: 1_500_000, currency: "NGN", cycle: "2027/28" })
    expect(PLUS_ENDS.toISOString()).toBe("2028-09-30T22:59:59.000Z")
    expect(plusOnSale(NOW)).toBe(true)
    expect(plusOnSale(new Date("2028-10-01T00:00:00Z"))).toBe(false)
  })
})
