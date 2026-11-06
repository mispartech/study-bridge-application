import "server-only"

import type { LanguageModel } from "ai"

import { generateText, loadPrompt } from "@/lib/ai"

import { uncheckedFigures } from "./figures"
import { scrubLinks, urlsIn } from "./link-guard"
import { advisorTools, type AdvisorContext, type ProgrammeCard, type Source } from "./tools"

const MAX_TOOL_STEPS = 6
const MAX_ATTEMPTS = 2

export const SAFE_MESSAGE =
  "I couldn't confirm every figure in that answer, so I've left them out. The records I found are below, and each one links to its source."

export type ChatMessage = { role: "user" | "assistant"; content: string }

export type AdvisorEvent =
  /** The model has started writing; the answer is held back until it's been checked. */
  | { type: "checking" }
  | { type: "text"; text: string; fallback?: boolean }
  | { type: "tool"; name: string; output: unknown; programmes: ProgrammeCard[]; sources: Source[] }
  | { type: "error"; message: string }

export type GuardTrigger = { attempt: number; outcome: "regenerated" | "safe_message"; figures: string[] }

type TurnOptions = {
  userId?: string
  onGuard?: (trigger: GuardTrigger) => void | Promise<void>
  /** Inject a model instance (tests). */
  model?: LanguageModel
}

/** R1 with the student's profile and shortlist filled in. */
export function advisorSystem(ctx: AdvisorContext, shortlist: unknown[]) {
  return loadPrompt("r1_advisor", {
    profile_json: JSON.stringify(ctx.profile),
    shortlist_json: JSON.stringify(shortlist),
    today: ctx.options.now.toISOString().slice(0, 10),
  })
}

const correction = (figures: string[]) =>
  figures.length === 0
    ? "Your last reply was empty. Answer the student now."
    : `Your last draft stated figures that aren't in any tool result or the student's messages: ${figures.join(", ")}. Rewrite it without them. Use the calculate tool for any sum or conversion.`

/**
 * One advisor turn. Tool results stream straight away, but the answer is held until every figure in it
 * is backed by this conversation. A failing draft is regenerated once, then replaced by a safe message.
 */
export async function* advisorTurn(
  messages: ChatMessage[],
  ctx: AdvisorContext,
  shortlist: unknown[],
  { userId, onGuard, model }: TurnOptions = {}
): AsyncGenerator<AdvisorEvent> {
  const system = await advisorSystem(ctx, shortlist)
  const tools = advisorTools(ctx)
  // Earlier advisor replies passed this guard when they were shown, so what they said can be repeated.
  const evidence = [ctx.options.now.toISOString().slice(0, 10), ...messages.map((m) => m.content)]
  const links = new Set<string>()
  let figures: string[] = []
  let empty = false

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const retry = attempt > 1
    const result = generateText("advisor", messages, {
      system: retry ? `${system}\n\n${correction(figures)}` : system,
      tools,
      maxSteps: MAX_TOOL_STEPS,
      userId,
      languageModelOverride: model,
    })
    let draft = ""
    for await (const part of result.fullStream) {
      if (part.type === "text-delta") {
        if (!draft) yield { type: "checking" }
        draft += part.text
      } else if (part.type === "tool-result") {
        evidence.push(JSON.stringify(part.output))
        urlsIn(part.output).forEach((url) => links.add(url))
        const output = part.output as { programmes?: ProgrammeCard[]; sources?: Source[] }
        yield {
          type: "tool",
          name: part.toolName,
          output: part.output,
          programmes: output.programmes ?? [],
          sources: output.sources ?? [],
        }
      } else if (part.type === "error") {
        yield { type: "error", message: part.error instanceof Error ? part.error.message : String(part.error) }
        return
      }
    }

    const answer = scrubLinks(draft, links).trim()
    empty = answer === ""
    figures = empty ? [] : uncheckedFigures(answer, evidence)
    if (!empty && figures.length === 0) {
      yield { type: "text", text: answer }
      return
    }
    await onGuard?.({ attempt, figures, outcome: attempt < MAX_ATTEMPTS ? "regenerated" : "safe_message" })
  }

  // The student has to see something: an error for silence, which refunds the message, or the safe message.
  if (empty) yield { type: "error", message: "The model returned an empty answer" }
  else yield { type: "text", text: SAFE_MESSAGE, fallback: true }
}
