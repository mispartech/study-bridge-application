import "server-only"

import Ajv2020, { type ErrorObject } from "ajv/dist/2020"
import addFormats from "ajv-formats"
import {
  generateText as sdkGenerateText,
  jsonSchema,
  Output,
  stepCountIs,
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

/**
 * Gives every bare string `enum` an explicit type. Gemini's schema conversion turns an
 * untyped enum into `{}` and drops the values of `type: [string, null]`; the `anyOf` form
 * for nullable enums survives it.
 */
function typedEnums(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(typedEnums)
  if (!node || typeof node !== "object") return node
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(node)) out[k] = typedEnums(v)
  const values = out.enum
  if (Array.isArray(values) && !("type" in out) && values.every((v) => typeof v === "string" || v === null)) {
    const strings = values.filter((v) => v !== null)
    if (values.includes(null)) {
      delete out.enum
      out.anyOf = [{ type: "string", enum: strings }, { type: "null" }]
    } else {
      out.type = "string"
    }
  }
  return out
}

/** Drops keywords that only describe the document and that some providers reject; types bare enums. */
function forProvider(schema: JsonSchemaObject): JsonSchemaObject {
  const rest = { ...schema }
  delete rest.$schema
  return typedEnums(rest) as JsonSchemaObject
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

type StructuredOptions = CallOptions & { toolName?: string; toolDescription?: string }

export type StructuredResult<T> = {
  data: T
  model: ModelRef
  usage: { inputTokens?: number; outputTokens?: number }
  latencyMs: number
}

/**
 * One structured generation, validated against `schema`. Uses a forced tool call named
 * `toolName` where the model supports it, otherwise the provider's native structured output.
 * Schema-invalid output is retried once; a second failure throws AiValidationError.
 */
export async function generateStructured<T = unknown>(
  task: AiTask,
  prompt: string,
  schema: JsonSchemaObject,
  options: StructuredOptions = {}
): Promise<StructuredResult<T>> {
  try {
    return await generateStructuredOnce<T>(task, prompt, schema, options)
  } catch (err) {
    if (!(err instanceof AiValidationError)) throw err
    return generateStructuredOnce<T>(task, prompt, schema, options)
  }
}

async function generateStructuredOnce<T>(
  task: AiTask,
  prompt: string,
  schema: JsonSchemaObject,
  { toolName = "record", ...opts }: StructuredOptions
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
  { tools, system, maxSteps = 1, ...opts }: CallOptions & { tools?: ToolSet; system?: string; maxSteps?: number } = {}
) {
  const ref = opts.model ?? modelFor(task)
  const started = performance.now()
  return streamText({
    model: opts.languageModelOverride ?? languageModel(ref),
    system,
    messages,
    tools,
    stopWhen: stepCountIs(maxSteps),
    prepareStep: ({ stepNumber }) => (stepNumber === maxSteps - 1 ? { toolChoice: "none" as const } : {}),
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
