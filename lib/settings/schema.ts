import { z } from "zod"

import { modelRef } from "@/lib/ai/config"

/** Models an admin can pick per task. Provider keys still come only from the environment. */
export const MODEL_CHOICES = [
  "google:gemini-3.6-flash",
  "anthropic:claude-haiku-5-5",
  "anthropic:claude-sonnet-5-5",
] as const

export const AI_TASKS = ["advisor", "explanations", "extraction"] as const

const price = z.object({
  /** US dollars per million tokens, as published by the provider. */
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
})

/** Every admin-editable setting. Absent keys fall back to code defaults. */
export const settingsSchema = z.object({
  ai_models: z.partialRecord(z.enum(AI_TASKS), modelRef).default({}),
  /** Keyed "provider:model". */
  model_prices: z.record(z.string(), price).default({}),
  advisor_free_limit: z.number().int().min(0).max(100).nullable().default(null),
})
export type Settings = z.infer<typeof settingsSchema>
export type SettingKey = keyof Settings

/** Estimated US-dollar cost of one call, or null when no price is set for its model. */
export function estimateCostUsd(
  prices: Settings["model_prices"],
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number
): number | null {
  const p = prices[`${provider}:${model}`]
  if (!p) return null
  return (inputTokens * p.input + outputTokens * p.output) / 1_000_000
}
