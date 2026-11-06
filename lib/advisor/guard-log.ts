import "server-only"

import { serviceClient } from "@/lib/db/service"

import type { GuardTrigger } from "./run"

/** Records a rejected draft. Never throws: logging must not stop the student getting an answer. */
export async function logGuardTrigger(userId: string, { attempt, outcome, figures }: GuardTrigger) {
  console.warn(`Advisor number guard: ${outcome} on attempt ${attempt}: ${figures.join(", ") || "empty answer"}`)
  const { error } = await serviceClient()
    .from("advisor_guard_log")
    .insert({ user_id: userId, attempt, outcome, figures })
  if (error) console.error("advisor_guard_log insert failed:", error.message)
}
