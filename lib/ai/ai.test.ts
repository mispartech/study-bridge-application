// @vitest-environment node
import { readFileSync } from "node:fs"

import { MockLanguageModelV4 } from "ai/test"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AI_CONFIG, modelFor, parseModelRef } from "./config"
import { budgetBand, nationalityGroup, profileBucket, sourceVersion } from "./explanations"
import { AiValidationError, generateStructured } from "./index"
import { renderPrompt } from "./prompts"
import { deterministicSettings, structuredProviderOptions, supportsForcedTool } from "./providers"

const logUsage = vi.hoisted(() => vi.fn())
vi.mock("./usage", () => ({ logUsage }))

const usage = {
  inputTokens: { total: 120, noCache: 120, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 30, text: 30, reasoning: undefined },
}
const schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  additionalProperties: false,
  required: ["found", "fee"],
  properties: { found: { type: "boolean" }, fee: { type: ["number", "null"], minimum: 0 } },
}

function toolCallModel(input: unknown) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "tool-call", toolCallId: "c1", toolName: "record_programme", input: JSON.stringify(input) }],
      finishReason: { unified: "tool-calls", raw: undefined },
      usage,
      warnings: [],
    }),
  })
}

beforeEach(() => logUsage.mockClear())

describe("config", () => {
  it("reads the model per task from config/ai.json", () => {
    expect(modelFor("extraction")).toEqual({ provider: "anthropic", model: "claude-haiku-5-5" })
    expect(modelFor("advisor")).toEqual({ provider: "anthropic", model: "claude-sonnet-5-5" })
    expect(modelFor("explanations")).toEqual({ provider: "google", model: "gemini-3.6-flash" })
    expect(Object.keys(AI_CONFIG).sort()).toEqual(["advisor", "explanations", "extraction"])
  })

  it("parses provider:model overrides, with gemini as an alias for google", () => {
    expect(parseModelRef("gemini:gemini-3.6-flash")).toEqual({ provider: "google", model: "gemini-3.6-flash" })
    expect(parseModelRef("openrouter:deepseek/deepseek-v4.1-flash")).toEqual({
      provider: "openrouter",
      model: "deepseek/deepseek-v4.1-flash",
    })
    expect(() => parseModelRef("claude-haiku-5-5")).toThrow(/provider:model/)
    expect(() => parseModelRef("bedrock:x")).toThrow()
  })
})

describe("provider rules", () => {
  it("never sends temperature to Anthropic; uses 0 elsewhere", () => {
    expect(deterministicSettings({ provider: "anthropic", model: "claude-haiku-5-5" })).toEqual({})
    expect(deterministicSettings({ provider: "google", model: "gemini-3.6-flash" })).toEqual({ temperature: 0 })
  })

  it("uses native structured output for models that reject forced tool calls", () => {
    expect(supportsForcedTool({ provider: "anthropic", model: "claude-haiku-5-5" })).toBe(true)
    expect(supportsForcedTool({ provider: "anthropic", model: "claude-sonnet-5-5" })).toBe(false)
    expect(supportsForcedTool({ provider: "openrouter", model: "deepseek/deepseek-v4.1-flash" })).toBe(true)
  })

  it("turns Anthropic thinking off only for forced tool calls", () => {
    expect(structuredProviderOptions({ provider: "anthropic", model: "claude-haiku-5-5" }, true)).toEqual({
      anthropic: { thinking: { type: "disabled" }, effort: "low" },
    })
    expect(structuredProviderOptions({ provider: "anthropic", model: "claude-sonnet-5-5" }, false)).toEqual({})
  })
})

describe("generateStructured", () => {
  it("returns the forced tool call's input when it matches the schema, and logs usage", async () => {
    const result = await generateStructured("extraction", "prompt", schema, {
      toolName: "record_programme",
      languageModelOverride: toolCallModel({ found: true, fee: 24500 }),
    })
    expect(result.data).toEqual({ found: true, fee: 24500 })
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 30 })
    expect(logUsage).toHaveBeenCalledWith(
      expect.objectContaining({ task: "extraction", provider: "anthropic", success: true, inputTokens: 120 })
    )
  })

  it("rejects output that breaks the schema and logs the failure", async () => {
    await expect(
      generateStructured("extraction", "prompt", schema, {
        toolName: "record_programme",
        languageModelOverride: toolCallModel({ found: "yes", fee: -1 }),
      })
    ).rejects.toBeInstanceOf(AiValidationError)
    expect(logUsage).toHaveBeenCalledWith(expect.objectContaining({ success: false }))
  })

  it("retries schema-invalid output once, and only once", async () => {
    const answers = [
      { found: "yes", fee: -1 },
      { found: true, fee: 100 },
    ]
    const model = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [
          {
            type: "tool-call",
            toolCallId: "c1",
            toolName: "record_programme",
            input: JSON.stringify(answers.shift()),
          },
        ],
        finishReason: { unified: "tool-calls", raw: undefined },
        usage,
        warnings: [],
      }),
    })
    const result = await generateStructured("extraction", "prompt", schema, {
      toolName: "record_programme",
      languageModelOverride: model,
    })
    expect(result.data).toEqual({ found: true, fee: 100 })
    expect(model.doGenerateCalls).toHaveLength(2)

    const alwaysBad = toolCallModel({ found: "yes", fee: -1 })
    await expect(
      generateStructured("extraction", "prompt", schema, {
        toolName: "record_programme",
        languageModelOverride: alwaysBad,
      })
    ).rejects.toBeInstanceOf(AiValidationError)
    expect(alwaysBad.doGenerateCalls).toHaveLength(2)
  })

  it("sends the forced tool choice and strips $schema from the tool schema", async () => {
    const model = toolCallModel({ found: false, fee: null })
    await generateStructured("extraction", "prompt", schema, {
      toolName: "record_programme",
      languageModelOverride: model,
    })
    const call = model.doGenerateCalls[0]!
    expect(call.toolChoice).toEqual({ type: "tool", toolName: "record_programme" })
    const tool = call.tools?.[0] as unknown as { name: string; inputSchema: Record<string, unknown> }
    expect(tool.name).toBe("record_programme")
    expect(tool.inputSchema).not.toHaveProperty("$schema")
    expect(call.temperature).toBeUndefined()
  })

  it("types bare enums for providers (Gemini drops untyped and nullable-typed enums)", async () => {
    const model = toolCallModel({ mode: null, country: "UK" })
    const enumSchema = {
      type: "object",
      properties: { mode: { enum: ["full_time", "part_time", null] }, country: { enum: ["UK", "CA"] } },
    }
    await generateStructured("extraction", "prompt", enumSchema, {
      toolName: "record_programme",
      languageModelOverride: model,
    })
    const tool = model.doGenerateCalls[0]!.tools?.[0] as unknown as { inputSchema: { properties: object } }
    expect(tool.inputSchema.properties).toEqual({
      mode: { anyOf: [{ type: "string", enum: ["full_time", "part_time"] }, { type: "null" }] },
      country: { type: "string", enum: ["UK", "CA"] },
    })
  })

  it("uses native structured output on models without forced tools", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [{ type: "text", text: JSON.stringify({ found: true, fee: 10 }) }],
        finishReason: { unified: "stop", raw: undefined },
        usage,
        warnings: [],
      }),
    })
    const result = await generateStructured("advisor", "prompt", schema, { languageModelOverride: model })
    expect(result.data).toEqual({ found: true, fee: 10 })
    expect(model.doGenerateCalls[0]!.responseFormat).toMatchObject({ type: "json" })
  })
})

describe("prompts", () => {
  it("fills placeholders and refuses missing or unknown ones", () => {
    expect(renderPrompt("Hi {{name}}, {{n}}", { name: "Ada", n: 2 })).toBe("Hi Ada, 2")
    expect(() => renderPrompt("Hi {{name}}", {})).toThrow(/name/)
    expect(() => renderPrompt("Hi", { extra: 1 })).toThrow(/extra/)
  })

  it("keeps R3 and the record_programme schema verbatim from docs/EXTRACTION.md", () => {
    const doc = readFileSync("docs/EXTRACTION.md", "utf8").replace(/\r\n/g, "\n")
    const block = (heading: string) => doc.slice(doc.indexOf(heading)).match(/```\w+\n([\s\S]*?)\n```/)![1]!
    expect(readFileSync("prompts/r3_extraction.txt", "utf8").replace(/\r\n/g, "\n")).toBe(
      `${block("## 2. R3 system prompt")}\n`
    )
    expect(JSON.parse(readFileSync("schemas/record_programme.schema.json", "utf8"))).toEqual(
      JSON.parse(block("## 3. JSON Schema"))
    )
  })
})

describe("explanation cache keys", () => {
  const restricted = new Set(["NG", "SN"])

  it("builds the profile bucket from field, academic band, budget band and nationality group", () => {
    expect(
      profileBucket({
        field: "law",
        academicBand: "upper_second",
        budgetTotalMinorNgn: 3_500_000_000n, // ₦35m
        nationality: "NG",
        restrictedNationalities: restricted,
      })
    ).toBe("law|upper_second|20m_40m|NG_restricted")
  })

  it("bands budgets and nationalities", () => {
    expect(budgetBand(null)).toBe("unknown")
    expect(budgetBand(1_999_999_900)).toBe("under_20m")
    expect(budgetBand(2_000_000_000)).toBe("20m_40m")
    expect(budgetBand(10_000_000_000n)).toBe("70m_plus")
    expect(nationalityGroup("GH", restricted)).toBe("other")
    expect(nationalityGroup("SN", restricted)).toBe("restricted")
    expect(nationalityGroup("NG", new Set())).toBe("NG")
  })

  it("changes source version when facts change, not when only timestamps do", () => {
    const base = { id: "p1", title: "MSc X", updated_at: "2026-01-01", fee: { tuition: 100 } }
    const v = sourceVersion([base])
    expect(sourceVersion([{ ...base, updated_at: "2026-02-02", last_verified_at: "x" }])).toBe(v)
    expect(sourceVersion([{ fee: { tuition: 100 }, title: "MSc X", id: "p1" }])).toBe(v)
    expect(sourceVersion([{ ...base, fee: { tuition: 101 } }])).not.toBe(v)
  })
})
