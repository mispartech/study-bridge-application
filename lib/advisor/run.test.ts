// @vitest-environment node
import { simulateReadableStream } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import { describe, expect, it, vi } from "vitest"

import { matchProfile, type Catalogue } from "@/lib/match"
import demo from "@/tests/fixtures/demo-catalogue.json"

import { advisorTurn, SAFE_MESSAGE, type AdvisorEvent, type GuardTrigger } from "./run"
import type { AdvisorContext } from "./tools"

vi.mock("@/lib/ai/usage", () => ({ logUsage: async () => {} }))

const ctx: AdvisorContext = {
  profile: matchProfile.parse({ nationality: "NG", target_cycle: "2027/28" }),
  catalogue: demo as unknown as Catalogue,
  options: { now: new Date("2026-11-05T12:00:00Z"), demoMode: true },
  addToShortlist: async () => "added",
}

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
}

/** A model that answers with each of `replies` in turn. */
function modelSaying(...replies: string[]) {
  let call = 0
  return new MockLanguageModelV4({
    doStream: async () => {
      const text = replies[call++] ?? ""
      return {
        stream: simulateReadableStream({
          chunks: [
            { type: "stream-start" as const, warnings: [] },
            ...(text
              ? [
                  { type: "text-start" as const, id: "1" },
                  { type: "text-delta" as const, id: "1", delta: text },
                  { type: "text-end" as const, id: "1" },
                ]
              : []),
            { type: "finish" as const, finishReason: { unified: "stop" as const, raw: undefined }, usage },
          ],
        }),
      }
    },
  })
}

async function turn(model: MockLanguageModelV4, content = "How much is it?") {
  const triggers: GuardTrigger[] = []
  const events: AdvisorEvent[] = []
  const stream = advisorTurn([{ role: "user", content }], ctx, [], {
    model,
    onGuard: (trigger) => void triggers.push(trigger),
  })
  let checking = 0
  for await (const event of stream) {
    if (event.type === "checking") checking++
    else events.push(event)
  }
  return { events, triggers, checking }
}

const systemOf = (model: MockLanguageModelV4, call: number) => JSON.stringify(model.doStreamCalls[call]!.prompt)

describe("number guard", () => {
  it("shows a clean answer with no retry", async () => {
    const model = modelSaying("We hold nothing on that.")
    const { events, triggers } = await turn(model)
    expect(events).toEqual([{ type: "text", text: "We hold nothing on that." }])
    expect(triggers).toEqual([])
    expect(model.doStreamCalls).toHaveLength(1)
  })

  it("holds a figure back, regenerates once and names it in the note", async () => {
    const model = modelSaying("It costs £9,000.", "We hold no fee for that.")
    const { events, triggers } = await turn(model)
    expect(events).toEqual([{ type: "text", text: "We hold no fee for that." }])
    expect(triggers).toEqual([{ attempt: 1, outcome: "regenerated", figures: ["£9,000"] }])
    expect(systemOf(model, 1)).toContain("£9,000")
    expect(systemOf(model, 0)).not.toContain("Your last draft")
  })

  it("never shows the figure: a second failure becomes the safe message", async () => {
    const { events, triggers } = await turn(modelSaying("It costs £9,000.", "It costs £9,500."))
    expect(events).toEqual([{ type: "text", text: SAFE_MESSAGE, fallback: true }])
    expect(triggers.map((t) => t.outcome)).toEqual(["regenerated", "safe_message"])
    expect(JSON.stringify(events)).not.toContain("9,")
  })

  it("signals the check once per draft, before any answer", async () => {
    expect((await turn(modelSaying("We hold nothing on that."))).checking).toBe(1)
    expect((await turn(modelSaying("It costs £9,000.", "We hold no fee."))).checking).toBe(2)
  })

  it("lets the student's own figure through", async () => {
    const { events } = await turn(modelSaying("₦40m may fall short."), "Will ₦40m be enough?")
    expect(events).toEqual([{ type: "text", text: "₦40m may fall short." }])
  })

  it("retries an empty reply, then reports an error so the message is refunded", async () => {
    const recovered = await turn(modelSaying("", "Here you go."))
    expect(recovered.events).toEqual([{ type: "text", text: "Here you go." }])
    const { events } = await turn(modelSaying("", ""))
    expect(events.map((e) => e.type)).toEqual(["error"])
  })

  it("removes a link no tool returned before checking the answer", async () => {
    const { events } = await turn(modelSaying("Try https://agent.example.com today."))
    expect(events).toEqual([{ type: "text", text: "Try [link removed: not from our records] today." }])
  })
})
