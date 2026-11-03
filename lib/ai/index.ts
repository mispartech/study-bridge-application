import "server-only"

import Ajv2020, { type ErrorObject } from "ajv/dist/2020"
import addFormats from "ajv-formats"
import {
  generateText as sdkGenerateText,
  jsonSchema,
  Output,
  streamText,
  tool,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from "ai"

import { modelFor, type AiTask, type ModelRef } from "./config"
import { deterministicSettings, languageModel, structuredProviderOptions, supportsForcedTool } from "./providers"
import { logUsage } from "./usage"

export { modelFor, parseModelRef, type AiTask, type ModelRef } from "./config"
export { loadPrompt, renderPrompt } from "./prompts"

/** A JSON Schema object (draft 2020-12), e.g. schemas/record_programme.schema.json. */
export type JsonSchemaObject = Record<string, unknown>

export class AiValidationError extends Error {
  constructor(
    message: string,
    readonly errors: ErrorObject[] | null | undefined,
    readonly raw: unknown
  ) {
    super(message)
    this.name = "AiValidationError"
  }
}

const ajv = new Ajv2020({ allErrors: true, strict: false })
addFormats(ajv)
const validators = new WeakMap<object, ReturnType<typeof ajv.compile>>()
function validatorFor(schema: JsonSchemaObject) {
  let v = validators.get(schema)
  if (!v) validators.set(schema, (v = ajv.compile(schema)))
  return v
}

/** Drops keywords that only describe the document and that some providers reject. */
function forProvider(schema: JsonSchemaObject): JsonSchemaObject {
  const rest = { ...schema }
  delete rest.$schema
  return rest
}

type CallOptions = {
  /** Use this model instead of the task's configured one (comparisons, tests). */
  model?: ModelRef
  /** Inject a model instance directly (tests). */
  languageModelOverride?: LanguageModel
  userId?: string
  maxOutputTokens?: number
  abortSignal?: AbortSignal
}

export type StructuredResult<T> = {
  data: T
  model: ModelRef
  usage: { inputTokens?: number; outputTokens?: number }
  latencyMs: number
}

/**
 * One structured generation, validated against `schema`. Uses a forced tool call named
 * `toolName` where the model supports it, otherwise the provider's native structured output.
 * Throws AiValidationError when the model's JSON does not match the schema.
 */
export async function generateStructured<T = unknown>(
  task: AiTask,
  prompt: string,
  schema: JsonSchemaObject,
  { toolName = "record", ...opts }: CallOptions & { toolName?: string; toolDescription?: string } = {}
): Promise<StructuredResult<T>> {
  const ref = opts.model ?? modelFor(task)
  const model = opts.languageModelOverride ?? languageModel(ref)
  const forced = supportsForcedTool(ref)
  const started = performance.now()
  let usage: StructuredResult<T>["usage"] = {}

  try {
    let raw: unknown
    const common = {
      model,
      prompt,
      maxOutputTokens: opts.maxOutputTokens ?? 16_000,
      abortSignal: opts.abortSignal,
      providerOptions: structuredProviderOptions(ref, forced),
      ...deterministicSettings(ref),
    }
    if (forced) {
      const result = await sdkGenerateText({
        ...common,
        tools: {
          [toolName]: tool({ description: opts.toolDescription, inputSchema: jsonSchema(forProvider(schema)) }),
        },
        toolChoice: { type: "tool", toolName },
      })
      usage = { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens }
      const call = result.toolCalls.find((c) => c.toolName === toolName)
      if (!call) throw new AiValidationError(`Model did not call ${toolName}`, null, result.text)
      raw = call.input
    } else {
      const result = await sdkGenerateText({
        ...common,
        output: Output.object({ schema: jsonSchema(forProvider(schema)), name: toolName }),
      })
      usage = { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens }
      raw = result.output
    }

    const validate = validatorFor(schema)
    if (!validate(raw)) {
      throw new AiValidationError(
        `Output does not match schema: ${ajv.errorsText(validate.errors)}`,
        validate.errors,
        raw
      )
    }
    const latencyMs = performance.now() - started
    await logUsage({ task, ...ref, ...usage, latencyMs, success: true, userId: opts.userId })
    return { data: raw as T, model: ref, usage, latencyMs }
  } catch (err) {
    await logUsage({
      task,
      ...ref,
      ...usage,
      latencyMs: performance.now() - started,
      success: false,
      error: err instanceof Error ? err.message : String(err),
      userId: opts.userId,
    })
    throw err
  }
}

/**
 * Streamed text generation with optional tools (advisor, explanations). Returns the AI SDK
 * stream result, so routes can use `toUIMessageStreamResponse()` / `textStream`.
 * Usage is logged when the stream finishes.
 */
export function generateText(
  task: AiTask,
  messages: ModelMessage[],
  { tools, system, ...opts }: CallOptions & { tools?: ToolSet; system?: string } = {}
) {
  const ref = opts.model ?? modelFor(task)
  const started = performance.now()
  return streamText({
    model: opts.languageModelOverride ?? languageModel(ref),
    system,
    messages,
    tools,
    maxOutputTokens: opts.maxOutputTokens ?? 16_000,
    abortSignal: opts.abortSignal,
    onFinish: ({ usage }) =>
      logUsage({
        task,
        ...ref,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        latencyMs: performance.now() - started,
        success: true,
        userId: opts.userId,
      }),
    onError: ({ error }) =>
      logUsage({
        task,
        ...ref,
        latencyMs: performance.now() - started,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        userId: opts.userId,
      }),
  })
}
