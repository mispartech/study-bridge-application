import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"

import { HUMAN_HINT_COOKIE, HUMAN_PASS_MS } from "./human-hint"
import { clientIp, deviceIdFrom } from "./limits"
import type { Client } from "./rate-limit"
import { verifyTurnstile } from "./turnstile"

/**
 * One passed bot check covers this device for 30 minutes, so a student isn't asked again on every search,
 * report or advisor message. The pass is signed and tied to the device cookie, so it can't be copied or forged.
 * Rate limits still apply to every request.
 */
export const HUMAN_COOKIE = "sb-human"

function secret() {
  return process.env.IP_HASH_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || "studybridge"
}

const sign = (deviceId: string, expires: number) =>
  createHmac("sha256", secret()).update(`human:${deviceId}:${expires}`).digest("base64url").slice(0, 43)

function cookieValue(header: string | null, name: string) {
  return header
    ?.split(/;\s*/)
    .map((c) => c.split("="))
    .find(([n]) => n === name)?.[1]
}

/** True when the request carries a valid, unexpired pass for its own device. */
export function hasHumanPass(request: Request, now = Date.now()): boolean {
  const header = request.headers.get("cookie")
  const deviceId = deviceIdFrom(header)
  const [exp, sig] = (cookieValue(header, HUMAN_COOKIE) ?? "").split(".")
  const expires = Number(exp)
  if (!deviceId || !sig || !Number.isFinite(expires) || expires <= now) return false
  const expected = Buffer.from(sign(deviceId, expires))
  const given = Buffer.from(sig)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/** A valid pass, or a Turnstile token Cloudflare accepts. `issue` says to set a fresh pass on the response. */
export async function checkHuman(request: Request, token: unknown): Promise<{ human: boolean; issue: boolean }> {
  if (hasHumanPass(request)) return { human: true, issue: false }
  const human = await verifyTurnstile(token, clientIp(request.headers))
  return { human, issue: human }
}

/** Sets the pass (httpOnly) and a readable hint, so the page knows it needn't load the check. */
export function withHumanPass<T extends Response>(response: T, client: Client, now = Date.now()): T {
  const expires = now + HUMAN_PASS_MS
  const maxAge = Math.floor(HUMAN_PASS_MS / 1000)
  response.headers.append(
    "set-cookie",
    `${HUMAN_COOKIE}=${expires}.${sign(client.deviceId, expires)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax; Secure`
  )
  response.headers.append(
    "set-cookie",
    `${HUMAN_HINT_COOKIE}=${expires}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`
  )
  return response
}

/** The 403 body every protected route returns, so pages can fetch a token and try once more. */
export const HUMAN_REQUIRED = {
  error: "Security check failed. Refresh and try again.",
  code: "human_required",
} as const
