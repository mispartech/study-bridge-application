import { NextResponse } from "next/server"

import { clientEvent, validProperties } from "@/lib/activity/events"
import { actorFor, recordActivity } from "@/lib/activity/record"
import { ANALYTICS_COOKIE } from "@/lib/analytics/consent"
import { currentUser, hasSessionCookie } from "@/lib/auth/server"
import { clientIp, LIMITS } from "@/lib/security/limits"
import { clientFrom, hashKey, hitBoth, withDeviceCookie } from "@/lib/security/rate-limit"

const cookieNames = (header: string | null) =>
  (header ?? "").split(";").map((c) => ({ name: c.split("=")[0]!.trim(), value: c.split("=")[1]?.trim() }))

/**
 * Activity from the browser. Anonymous visitors are recorded only after they agreed to analytics (the same
 * rule as PostHog); signed-in students agreed at sign-up. Without consent the event is quietly dropped.
 */
export async function POST(request: Request) {
  const parsed = clientEvent.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid event" }, { status: 400 })
  const { event, target_type, target_id, properties, session_id } = parsed.data
  const props = validProperties(event, properties)
  if (!props.success) return NextResponse.json({ error: "Invalid properties" }, { status: 400 })

  const cookies = cookieNames(request.headers.get("cookie"))
  const signedIn = hasSessionCookie(cookies)
  const consented = cookies.some((c) => c.name === ANALYTICS_COOKIE && c.value === "1")
  if (!signedIn && !consented) return new NextResponse(null, { status: 204 })

  const client = clientFrom(request)
  const limit = await hitBoth(LIMITS.activity, client)
  if (!limit.allowed) return withDeviceCookie(new NextResponse(null, { status: 429 }), client)
  const user = signedIn ? await currentUser().catch(() => null) : null

  await recordActivity(event, {
    actor: actorFor(user, client.deviceKey),
    target: target_type && target_id ? { type: target_type, id: target_id } : undefined,
    properties: props.data as never,
    sessionId: session_id,
    ipHash: hashKey(`ip:${clientIp(request.headers)}`),
    userAgent: request.headers.get("user-agent"),
  })
  return withDeviceCookie(new NextResponse(null, { status: 204 }), client)
}
