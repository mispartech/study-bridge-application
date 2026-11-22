import { describe, expect, it, vi } from "vitest"

import { checkHuman, hasHumanPass, withHumanPass } from "./human-pass"
import type { Client } from "./rate-limit"

vi.mock("./turnstile", () => ({ verifyTurnstile: vi.fn(async (token: unknown) => token === "good") }))

const DEVICE = "0f8fad5b-d9cb-469f-a165-70867728950e"
const client = { deviceId: DEVICE, newDevice: false, deviceKey: "d", ipKey: "i" } satisfies Client

/** Issues a pass at `at`, and returns a request carrying it from `device`. */
function requestWithPass(at: number, device = DEVICE) {
  const res = withHumanPass(new Response(null), client, at)
  const pass = res.headers
    .getSetCookie()
    .find((c) => c.startsWith("sb-human="))!
    .split(";")[0]
  return new Request("http://localhost/api/match", { headers: { cookie: `sb-device=${device}; ${pass}` } })
}

describe("human pass", () => {
  const now = Date.now()

  it("covers the same device for 30 minutes, then lapses", () => {
    expect(hasHumanPass(requestWithPass(now), now + 29 * 60_000)).toBe(true)
    expect(hasHumanPass(requestWithPass(now), now + 31 * 60_000)).toBe(false)
  })

  it("can't be moved to another device or edited", () => {
    expect(hasHumanPass(requestWithPass(now, "11111111-2222-4333-8444-555555555555"), now)).toBe(false)
    const forged = new Request("http://localhost/", {
      headers: { cookie: `sb-device=${DEVICE}; sb-human=${now + 3_600_000}.forged` },
    })
    expect(hasHumanPass(forged, now)).toBe(false)
  })

  it("needs a Turnstile token only without a pass, and issues one after a good token", async () => {
    expect(await checkHuman(requestWithPass(now), undefined)).toEqual({ human: true, issue: false })
    const bare = new Request("http://localhost/", { headers: { cookie: `sb-device=${DEVICE}` } })
    expect(await checkHuman(bare, undefined)).toEqual({ human: false, issue: false })
    expect(await checkHuman(bare, "good")).toEqual({ human: true, issue: true })
  })

  it("sets the pass as httpOnly and a readable hint beside it", () => {
    const cookies = withHumanPass(new Response(null), client, now).headers.getSetCookie()
    expect(cookies.find((c) => c.startsWith("sb-human="))).toContain("HttpOnly")
    expect(cookies.find((c) => c.startsWith("sb-human-until="))).not.toContain("HttpOnly")
  })
})
