/**
 * Limits for anonymous use (docs/SPEC_ACCESS_ADMIN.md, section 1). Per device is the real limit. Per IP is set
 * higher on purpose: Nigerian mobile networks put many people behind one shared IP address.
 */
export const HOUR = 3600
export const DAY = 86_400
/** Days start at midnight Lagos time (UTC+1). */
export const LAGOS_OFFSET = 3600

export type Limit = { bucket: string; windowSeconds: number; limit: number; offsetSeconds?: number }

export const LIMITS = {
  quickMatch: {
    device: { bucket: "quick_match:device", windowSeconds: HOUR, limit: 30 },
    ip: { bucket: "quick_match:ip", windowSeconds: HOUR, limit: 300 },
  },
  /** Full results re-rank as the budget slider moves, so they allow more than the landing page. */
  match: {
    device: { bucket: "match:device", windowSeconds: HOUR, limit: 120 },
    ip: { bucket: "match:ip", windowSeconds: HOUR, limit: 1200 },
  },
  advisorAnonymous: {
    device: { bucket: "advisor_anon:device", windowSeconds: DAY, limit: 2, offsetSeconds: LAGOS_OFFSET },
    ip: { bucket: "advisor_anon:ip", windowSeconds: DAY, limit: 20, offsetSeconds: LAGOS_OFFSET },
  },
  /** Spec: 3 a day per IP. Applied per device, with a higher IP ceiling because mobile networks share IPs. */
  report: {
    device: { bucket: "report:device", windowSeconds: DAY, limit: 3, offsetSeconds: LAGOS_OFFSET },
    ip: { bucket: "report:ip", windowSeconds: DAY, limit: 30, offsetSeconds: LAGOS_OFFSET },
  },
  /** Activity events from browsers: generous, but enough to stop a script flooding the table. */
  activity: {
    device: { bucket: "activity:device", windowSeconds: HOUR, limit: 600 },
    ip: { bucket: "activity:ip", windowSeconds: HOUR, limit: 6000 },
  },
} satisfies Record<string, { device: Limit; ip: Limit }>

/** Spec: at most 2 reports a day to one email address. */
export const REPORT_PER_EMAIL: Limit = {
  bucket: "report:email",
  windowSeconds: DAY,
  limit: 2,
  offsetSeconds: LAGOS_OFFSET,
}

export const DEVICE_COOKIE = "sb-device"
const DEVICE_ID = /^[0-9a-f-]{36}$/

/** The device id from the cookie, if it is one we issued. */
export function deviceIdFrom(cookieHeader: string | null): string | null {
  const value = (cookieHeader ?? "")
    .split(";")
    .map((c) => c.trim().split("="))
    .find(([name]) => name === DEVICE_COOKIE)?.[1]
  return value && DEVICE_ID.test(value) ? value : null
}

/** The client's IP: Vercel puts it first in x-forwarded-for. */
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown"
}
