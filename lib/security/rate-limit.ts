import "server-only"

import { createHmac, randomUUID } from "node:crypto"

import { serviceClient } from "@/lib/db/service"

import { clientIp, DEVICE_COOKIE, deviceIdFrom, type Limit } from "./limits"

/** Device and IP are stored only as keyed hashes, so the table never holds an address. */
export function hashKey(value: string): string {
  const secret = process.env.IP_HASH_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || "studybridge"
  return createHmac("sha256", secret).update(value).digest("hex").slice(0, 32)
}

export type Client = { deviceId: string; newDevice: boolean; deviceKey: string; ipKey: string }

/** Who is asking, as hashed keys. A visitor without a device cookie gets a new id to set on the response. */
export function clientFrom(request: Request): Client {
  const existing = deviceIdFrom(request.headers.get("cookie"))
  const deviceId = existing ?? randomUUID()
  return {
    deviceId,
    newDevice: !existing,
    deviceKey: hashKey(`device:${deviceId}`),
    ipKey: hashKey(`ip:${clientIp(request.headers)}`),
  }
}

/** Sets the device cookie on a response when the visitor didn't have one. Needed only to count fairly. */
export function withDeviceCookie<T extends Response>(response: T, client: Client): T {
  if (client.newDevice) {
    response.headers.append(
      "set-cookie",
      `${DEVICE_COOKIE}=${client.deviceId}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax; Secure`
    )
  }
  return response
}

/** Counts one hit. If the limiter itself fails, the request is allowed: a database blip must not lock people out. */
export async function hit(limit: Limit, keyHash: string): Promise<{ allowed: boolean; hits: number }> {
  const { data, error } = await serviceClient()
    .rpc("hit_rate_limit", {
      p_bucket: limit.bucket,
      p_key_hash: keyHash,
      p_window_seconds: limit.windowSeconds,
      p_limit: limit.limit,
      p_offset_seconds: limit.offsetSeconds ?? 0,
    })
    .single()
  if (error || !data) {
    console.error("rate limit check failed:", error?.message ?? "no result")
    return { allowed: true, hits: 0 }
  }
  return { allowed: data.allowed, hits: data.hits }
}

/** Both limits must allow the request. Counts against both. */
export async function hitBoth(limits: { device: Limit; ip: Limit }, client: Client) {
  const [device, ip] = await Promise.all([hit(limits.device, client.deviceKey), hit(limits.ip, client.ipKey)])
  return { allowed: device.allowed && ip.allowed, deviceHits: device.hits }
}

/** Gives back one hit on both keys, e.g. when the model failed to answer. */
export async function refundBoth(limits: { device: Limit; ip: Limit }, client: Client): Promise<number> {
  const refund = (limit: Limit, key: string) =>
    serviceClient().rpc("refund_rate_limit", {
      p_bucket: limit.bucket,
      p_key_hash: key,
      p_window_seconds: limit.windowSeconds,
      p_offset_seconds: limit.offsetSeconds ?? 0,
    })
  const [device] = await Promise.all([refund(limits.device, client.deviceKey), refund(limits.ip, client.ipKey)])
  return typeof device.data === "number" ? device.data : 0
}

/** Hits used so far in the current window, without counting one. */
export async function peek(limit: Limit, keyHash: string): Promise<number> {
  const db = serviceClient()
  const { data: window } = await db.rpc("rate_limit_window", {
    p_window_seconds: limit.windowSeconds,
    p_offset_seconds: limit.offsetSeconds ?? 0,
  })
  if (!window) return 0
  const { data } = await db
    .from("rate_limit")
    .select("hits")
    .eq("bucket", limit.bucket)
    .eq("key_hash", keyHash)
    .eq("window_start", window)
    .maybeSingle()
  return data?.hits ?? 0
}
