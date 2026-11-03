import "server-only"

import { serviceClient } from "@/lib/db/service"
import type { AiTask, ModelRef } from "./config"

export type UsageRecord = ModelRef & {
  task: AiTask | (string & {})
  inputTokens?: number
  outputTokens?: number
  latencyMs: number
  success: boolean
  error?: string
  userId?: string
}

/** Writes one ai_usage row. Never throws: logging must not break the user-facing call. */
export async function logUsage(record: UsageRecord): Promise<void> {
  try {
    const db = serviceClient()
    const { error } = await db.from("ai_usage").insert({
      task: record.task,
      provider: record.provider,
      model: record.model,
      input_tokens: record.inputTokens ?? null,
      output_tokens: record.outputTokens ?? null,
      latency_ms: Math.max(0, Math.round(record.latencyMs)),
      success: record.success,
      error: record.error?.slice(0, 1000) ?? null,
      user_id: record.userId ?? null,
    })
    if (error) console.error("ai_usage insert failed:", error.message)
  } catch (err) {
    console.error("ai_usage logging failed:", err instanceof Error ? err.message : err)
  }
}
