import "server-only"

import type { User } from "@supabase/supabase-js"

import type { Json } from "@/lib/db/database.types"
import { serviceClient } from "@/lib/db/service"
import { roleOf } from "@/lib/auth/roles"

import { validProperties, type ActivityEvent, type ActivityProps } from "./events"

type Actor =
  { type: "student" | "staff"; id: string } | { type: "anonymous"; id: string | null } | { type: "system"; id?: null }

export const actorFor = (user: User | null, deviceKey: string | null): Actor =>
  user ? { type: roleOf(user) ? "staff" : "student", id: user.id } : { type: "anonymous", id: deviceKey }

/** Browser family only (Chrome, Safari...), never the full user agent string. */
export function userAgentFamily(ua: string | null): string | null {
  if (!ua) return null
  if (/edg\//i.test(ua)) return "Edge"
  if (/opr\/|opera/i.test(ua)) return "Opera"
  if (/samsungbrowser/i.test(ua)) return "Samsung Internet"
  if (/chrome|crios/i.test(ua)) return "Chrome"
  if (/firefox|fxios/i.test(ua)) return "Firefox"
  if (/safari/i.test(ua)) return "Safari"
  return "Other"
}

/**
 * Records one activity event. Properties are validated against the event's schema first; an invalid event
 * is dropped and logged. Never throws: tracking must not break what the student is doing.
 */
export async function recordActivity<E extends ActivityEvent>(
  event: E,
  {
    actor,
    target,
    properties,
    sessionId,
    ipHash,
    userAgent,
  }: {
    actor: Actor
    target?: { type: string; id: string }
    properties?: ActivityProps<E>
    sessionId?: string
    ipHash?: string
    userAgent?: string | null
  }
): Promise<void> {
  const checked = validProperties(event, properties)
  if (!checked.success) {
    console.error(`activity ${event} dropped: invalid properties`)
    return
  }
  try {
    const { error } = await serviceClient()
      .from("activity_event")
      .insert({
        actor_type: actor.type,
        actor_id: actor.id ?? null,
        session_id: sessionId ?? null,
        event,
        target_type: target?.type ?? null,
        target_id: target?.id ?? null,
        properties: checked.data as NonNullable<Json>,
        ip_hash: ipHash ?? null,
        user_agent_family: userAgentFamily(userAgent ?? null),
      })
    if (error) console.error(`activity ${event} insert failed:`, error.message)
  } catch (err) {
    console.error(`activity ${event} failed:`, err instanceof Error ? err.message : err)
  }
}
