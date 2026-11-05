import "server-only"

import { generateText, loadPrompt } from "@/lib/ai"

import { linkGuard } from "./link-guard"
import { advisorTools, type AdvisorContext, type ProgrammeCard, type Source } from "./tools"

const MAX_TOOL_STEPS = 6

export type ChatMessage = { role: "user" | "assistant"; content: string }

export type AdvisorEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; output: unknown; programmes: ProgrammeCard[]; sources: Source[] }
  | { type: "error"; message: string }

/** R1 verbatim, with the student's profile and shortlist filled in. */
export function advisorSystem(ctx: AdvisorContext, shortlist: unknown[]) {
  return loadPrompt("r1_advisor", {
    profile_json: JSON.stringify(ctx.profile),
    shortlist_json: JSON.stringify(shortlist),
    today: ctx.options.now.toISOString().slice(0, 10),
  })
}

/** One advisor turn through the adapter ("advisor" in config/ai.json), as a stream of events. */
export async function* advisorTurn(
  messages: ChatMessage[],
  ctx: AdvisorContext,
  shortlist: unknown[],
  userId?: string
): AsyncGenerator<AdvisorEvent> {
  const result = generateText("advisor", messages, {
    system: await advisorSystem(ctx, shortlist),
    tools: advisorTools(ctx),
    maxSteps: MAX_TOOL_STEPS,
    userId,
  })
  const guard = linkGuard()
  let answered = false
  for await (const part of result.fullStream) {
    if (part.type === "text-delta") {
      const text = guard.push(part.text)
      if (text) {
        answered = true
        yield { type: "text", text }
      }
    } else if (part.type === "tool-result") {
      guard.allow(part.output)
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
    }
  }
  const rest = guard.flush()
  if (rest) yield { type: "text", text: rest }
  // The model sometimes stops without a word; the student has to see that rather than silence.
  if (!answered && !rest) yield { type: "error", message: "The model returned an empty answer" }
}
