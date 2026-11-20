"use client"

import type { CLIENT_EVENTS, TARGET_TYPES } from "./events"

const SESSION_KEY = "sb-activity-session"

/** One id per browser tab, so a visit's events can be read as a sequence. Not stored anywhere else. */
function sessionId(): string | undefined {
  try {
    let id = sessionStorage.getItem(SESSION_KEY)
    if (!id) {
      id = crypto.randomUUID()
      sessionStorage.setItem(SESSION_KEY, id)
    }
    return id
  } catch {
    return undefined
  }
}

/** Signed in, or agreed to analytics. Without either, nothing is sent (the server would drop it anyway). */
function allowed(): boolean {
  if (typeof document === "undefined") return false
  const cookies = document.cookie
  return cookies.includes("sb-analytics=1") || /sb-[^=]*-auth-token/.test(cookies)
}

/** Records how a student acts on suggestions. Fire and forget: never blocks or breaks the page. */
export function logActivity(
  event: (typeof CLIENT_EVENTS)[number],
  {
    target,
    properties = {},
  }: { target?: { type: (typeof TARGET_TYPES)[number]; id: string }; properties?: Record<string, unknown> } = {}
) {
  if (!allowed()) return
  void fetch("/api/activity", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      event,
      properties,
      session_id: sessionId(),
      ...(target && { target_type: target.type, target_id: target.id }),
    }),
    keepalive: true,
  }).catch(() => undefined)
}
