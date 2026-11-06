// @vitest-environment node
import { readFileSync } from "node:fs"

import { beforeEach, describe, expect, it, vi } from "vitest"

import demo from "@/tests/fixtures/demo-catalogue.json"

import { matchProfile, rank, type Catalogue } from "."
import { explainTop, explanationBucket, r2Input } from "./explanations"

const generateStructured = vi.hoisted(() => vi.fn())
const readExplanations = vi.hoisted(() => vi.fn())
const writeExplanations = vi.hoisted(() => vi.fn())

vi.mock("@/lib/ai", async (original) => ({
  ...(await original<typeof import("@/lib/ai")>()),
  generateStructured,
}))
vi.mock("@/lib/ai/explanations", async (original) => ({
  ...(await original<typeof import("@/lib/ai/explanations")>()),
  readExplanations,
  writeExplanations,
}))

const NOW = new Date("2026-11-04T12:00:00Z")
const catalogue = demo as unknown as Catalogue
const profile = matchProfile.parse({
  nationality: "NG",
  degree_class: "upper_second",
  cgpa: 3.8,
  cgpa_scale: 5,
  field: "computer_data_science",
  ielts: 7,
  budget_total_minor: 80_000_000_00,
  target_cycle: "2027/28",
  target_term: "fall",
  accommodation_pref: "university_halls",
})
const result = rank(profile, catalogue, { now: NOW, demoMode: true })
const ids = result.ranked.slice(0, 20).map((r) => r.bundle.programme.id)

async function collect() {
  const out = []
  for await (const e of explainTop(profile, result, catalogue, { now: NOW })) out.push(e)
  return out
}

const model = { provider: "anthropic", model: "claude-haiku-5-5" }
const answer = (programme_id: string) => ({ programme_id, why: "Fits your budget.", watch_out: null })

beforeEach(() => {
  generateStructured.mockReset()
  readExplanations.mockReset().mockResolvedValue(new Map())
  writeExplanations.mockReset().mockResolvedValue(undefined)
})

describe("R2 explanations", () => {
  it("keeps the prompt file exactly as supplied, with no placeholders", () => {
    const text = readFileSync("prompts/r2_explanations.txt", "utf8")
    expect(text.startsWith("You write short match explanations for a study-abroad shortlist.")).toBe(true)
    expect(text.trimEnd().endsWith("Output JSON only.")).toBe(true)
    expect(text).not.toContain("{{")
  })

  it("makes one call for the whole top 20 through the adapter, and caches each answer", async () => {
    generateStructured.mockResolvedValue({ data: { explanations: ids.map(answer) }, model })
    const out = await collect()
    expect(ids.length).toBeGreaterThan(0)
    expect(generateStructured).toHaveBeenCalledTimes(1)
    expect(generateStructured.mock.calls[0]![0]).toBe("explanations")
    expect(out).toHaveLength(ids.length)
    expect(writeExplanations.mock.calls[0]![1]).toHaveLength(ids.length)
  })

  it("makes no model call when everything is cached", async () => {
    readExplanations.mockResolvedValue(new Map(ids.map((id) => [id, { why: "Cached.", watch_out: null }])))
    const out = await collect()
    expect(generateStructured).not.toHaveBeenCalled()
    expect(out.every((e) => e.cached)).toBe(true)
  })

  it("sends only the programmes missing from the cache", async () => {
    readExplanations.mockResolvedValue(new Map([[ids[0], { why: "Cached.", watch_out: null }]]))
    generateStructured.mockResolvedValue({ data: { explanations: ids.slice(1).map(answer) }, model })
    await collect()
    const prompt = generateStructured.mock.calls[0]![1] as string
    const input = JSON.parse(prompt.slice(prompt.indexOf("Input:\n") + 7)) as { programmes: { programme_id: string }[] }
    expect(input.programmes.map((p) => p.programme_id)).toEqual(ids.slice(1))
  })

  it("yields cached explanations before waiting on the model", async () => {
    readExplanations.mockResolvedValue(new Map([[ids[0], { why: "Cached.", watch_out: null }]]))
    generateStructured.mockResolvedValue({ data: { explanations: ids.slice(1).map(answer) }, model })
    const out = await collect()
    expect(out[0]).toMatchObject({ programme_id: ids[0], cached: true })
  })

  it("drops an explanation for a programme it wasn't asked about", async () => {
    generateStructured.mockResolvedValue({ data: { explanations: [answer(ids[0]!), answer("invented")] }, model })
    expect((await collect()).map((e) => e.programme_id)).toEqual([ids[0]])
  })

  it("passes a model failure to the caller, so results can still render", async () => {
    generateStructured.mockRejectedValue(new Error("credit balance too low"))
    await expect(collect()).rejects.toThrow("credit balance")
  })

  it("sends the facts the prompt's watch-outs depend on, and no personal details", () => {
    const input = r2Input(profile, result, result.ranked.slice(0, 1), NOW)
    expect(input.programmes[0]).toMatchObject({
      affordability: expect.any(String),
      days_to_deadline: expect.any(Number),
    })
    expect(input.programmes[0]).toHaveProperty("reach_grades")
    expect(input.programmes[0]).toHaveProperty("min_work_years")
    expect(JSON.stringify(input.student)).not.toContain("NG")
  })

  it("formats money the way the UI shows it", () => {
    const input = r2Input(profile, result, result.ranked.slice(0, 1), NOW)
    expect(input.student.budget).toBe("₦80m")
    expect(input.programmes[0]!.total_first_year).toMatch(/^₦\d+(\.\d)?m$/)
    expect(input.programmes[0]!.total_first_year_local).toMatch(/^(£|CA\$)\d+(\.\d)?k$/)
    expect(input.programmes[0]!.cost_breakdown[0]!.amount).toMatch(/^(£|CA\$)/)
    expect(input.programmes[0]!.cost_breakdown.some((l) => l.estimated)).toBe(true)
  })

  it("buckets by field, band, budget band and nationality group", () => {
    expect(explanationBucket(profile, result, catalogue)).toBe(
      "computer_data_science|upper_second|70m_plus|NG_restricted"
    )
  })
})
