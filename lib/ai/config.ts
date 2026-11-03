import { z } from "zod"

import rawConfig from "@/config/ai.json"

export const PROVIDERS = ["anthropic", "google", "openai", "openrouter"] as const
export type Provider = (typeof PROVIDERS)[number]

/** Env var holding each provider's API key. Keys only ever come from the environment. */
export const PROVIDER_KEY_ENV: Record<Provider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  google: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
}

export const modelRef = z.object({
  // "gemini" is accepted as an alias so config can use the product name.
  provider: z.enum([...PROVIDERS, "gemini"]).transform((p): Provider => (p === "gemini" ? "google" : p)),
  model: z.string().min(1),
})
export type ModelRef = z.output<typeof modelRef>

const aiConfig = z.object({
  extraction: modelRef,
  explanations: modelRef,
  advisor: modelRef,
})
export type AiTask = keyof z.infer<typeof aiConfig>

/** Model per task from config/ai.json. Switching provider is a one-line config change. */
export const AI_CONFIG = aiConfig.parse(rawConfig)

export function modelFor(task: AiTask): ModelRef {
  return AI_CONFIG[task]
}

/** Parses "provider:model" (e.g. "openrouter:deepseek/deepseek-v4.1-flash") for overrides and comparisons. */
export function parseModelRef(spec: string): ModelRef {
  const i = spec.indexOf(":")
  if (i <= 0) throw new Error(`Expected "provider:model", got "${spec}"`)
  return modelRef.parse({ provider: spec.slice(0, i), model: spec.slice(i + 1) })
}
