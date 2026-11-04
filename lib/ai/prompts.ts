import "server-only"

import { readFile } from "node:fs/promises"
import path from "node:path"

const PROMPTS_DIR = path.join(process.cwd(), "prompts")

/** Prompt files in /prompts (provider-neutral plain text with {{placeholders}}). */
export type PromptName = "r1" | "r2_explanations" | "r3_extraction"

/** Replaces every {{name}}; throws on a missing or unused value so templates can't drift silently. */
export function renderPrompt(template: string, vars: Record<string, string | number>): string {
  const used = new Set<string>()
  const out = template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    if (!(name in vars)) throw new Error(`Prompt placeholder {{${name}}} has no value`)
    used.add(name)
    return String(vars[name])
  })
  const unused = Object.keys(vars).filter((k) => !used.has(k))
  if (unused.length) throw new Error(`Values given for unknown placeholders: ${unused.join(", ")}`)
  return out
}

export async function loadPrompt(name: PromptName, vars: Record<string, string | number>): Promise<string> {
  const template = await readFile(path.join(PROMPTS_DIR, `${name}.txt`), "utf8")
  return renderPrompt(template.replace(/\r\n/g, "\n").replace(/\n$/, ""), vars)
}
