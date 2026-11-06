import "server-only"

import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import type { generateText, LanguageModel } from "ai"

import { PROVIDER_KEY_ENV, type ModelRef, type Provider } from "./config"

export class MissingApiKeyError extends Error {
  constructor(provider: Provider) {
    super(`${PROVIDER_KEY_ENV[provider]} is not set; it is required for provider "${provider}".`)
    this.name = "MissingApiKeyError"
  }
}

function apiKey(provider: Provider): string {
  const key = process.env[PROVIDER_KEY_ENV[provider]]
  if (!key) throw new MissingApiKeyError(provider)
  return key
}

export function languageModel({ provider, model }: ModelRef): LanguageModel {
  switch (provider) {
    case "anthropic":
      return createAnthropic({ apiKey: apiKey(provider) })(model)
    case "google":
      return createGoogleGenerativeAI({ apiKey: apiKey(provider) })(model)
    case "openai":
      return createOpenAI({ apiKey: apiKey(provider) })(model)
    case "openrouter":
      return createOpenRouter({ apiKey: apiKey(provider) }).chat(model)
  }
}

type ProviderOptions = NonNullable<Parameters<typeof generateText>[0]["providerOptions"]>

/**
 * Provider-specific request options for structured extraction. Kept here, not in config,
 * so switching a task's provider stays a one-line change.
 */
export function structuredProviderOptions({ provider }: ModelRef, forcedTool: boolean): ProviderOptions {
  // A forced tool call can't run alongside Anthropic thinking: switch thinking off
  // (allowed up to "high" effort on claude-haiku-5-5).
  if (provider === "anthropic" && forcedTool) {
    return { anthropic: { thinking: { type: "disabled" }, effort: "low" } }
  }
  return {}
}

/** Models that reject forced tool calls; they use native structured output instead. */
const NO_FORCED_TOOL = /^claude-(sonnet-5-5|opus-5-5|fable-5-1|mythos-5-1)/

export function supportsForcedTool({ provider, model }: ModelRef): boolean {
  return !(provider === "anthropic" && NO_FORCED_TOOL.test(model))
}

/** Temperature 0 where the provider allows it; Anthropic's current API rejects sampling params. */
export function deterministicSettings({ provider }: ModelRef): { temperature?: number } {
  return provider === "anthropic" ? {} : { temperature: 0 }
}
