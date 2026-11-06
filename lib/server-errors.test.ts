// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

import { describeFailure, MissingEnvError, requireEnv } from "./server-errors"

afterEach(() => vi.unstubAllEnvs())

describe("requireEnv", () => {
  it("returns the values when every variable is set", () => {
    vi.stubEnv("SB_A", "one")
    vi.stubEnv("SB_B", " two ")
    expect(requireEnv("SB_A", "SB_B")).toEqual({ SB_A: "one", SB_B: "two" })
  })

  it("names every missing variable at once, counting blanks as missing", () => {
    vi.stubEnv("SB_A", "one")
    vi.stubEnv("SB_B", "   ")
    expect(() => requireEnv("SB_A", "SB_B", "SB_C")).toThrow(MissingEnvError)
    try {
      requireEnv("SB_A", "SB_B", "SB_C")
    } catch (err) {
      expect((err as MissingEnvError).missing).toEqual(["SB_B", "SB_C"])
    }
  })
})

describe("describeFailure", () => {
  it("gives a clear code and names for a missing variable", () => {
    expect(describeFailure(new MissingEnvError(["SUPABASE_SERVICE_ROLE_KEY"]))).toEqual({
      status: 503,
      body: {
        error: "The service isn't configured",
        code: "SERVER_ENV_MISSING",
        missing: ["SUPABASE_SERVICE_ROLE_KEY"],
      },
    })
  })

  it("tells a rejected key from a missing one", () => {
    const failure = describeFailure(new Error("Could not load the catalogue: Invalid API key"))
    expect(failure.status).toBe(503)
    expect(failure.body.code).toBe("SERVER_ENV_REJECTED")
  })

  it("never passes a raw message on", () => {
    const secret = "postgres://user:hunter2@db.example/x failed"
    const failure = describeFailure(new Error(secret))
    expect(failure).toEqual({ status: 500, body: { error: "Something went wrong", code: "SERVER_ERROR" } })
    expect(JSON.stringify(failure)).not.toContain("hunter2")
  })
})
