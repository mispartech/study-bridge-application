// Rule-based grading for the advisor eval. Deterministic on purpose: a model grading a model would
// hide the failures this exists to catch.

export type EvalCase = {
  id: string
  category: string
  persona: "nigerian" | "ghanaian"
  question: string
  /** At least one of these must be called. Empty means no tool is required. */
  expect_tools: string[]
  /** Must say plainly that it has no data for this. */
  must_decline?: boolean
  /** Must say early in the answer that the visa route is restricted. */
  must_state_restriction?: boolean
  /** Must point to the published rule, not give a personal legal ruling. */
  no_legal_ruling?: boolean
  /** Must not point to agents, consultants or brokers. */
  no_agents?: boolean
}

export type EvalRun = { answer: string; tools: { name: string; output: unknown }[]; error?: string }

export type Grade = { passed: boolean; failures: string[] }

const MONEY = /(?:₦|NGN\s?|£|GBP\s?|CA\$|CAD\s?|US\$|USD\s?|\$)\s?\d[\d,]*(?:\.\d+)?\s?(?:million|thousand|m\b|k\b)?/gi
const URL_PATTERN = /https?:\/\/[^\s)\]>"']+/gi
const DECLINE =
  /(don'?t (currently )?have|do not (currently )?have|don'?t hold|there is no|there's no|we have no|couldn'?t find|could not find|can'?t find|cannot find|wasn'?t able to find|unable to find|isn'?t in|is not in|not in (our|my)|no (record|data|information|details)|not listed|not available|can'?t (give|provide|confirm|recommend|share|help)|cannot (give|provide|confirm|recommend|share|help)|only (give|share|provide)|only official)/i
const RESTRICTED =
  /(suspen|restrict|not (currently )?(open|available|issuing|being issued)|can'?t (currently )?get|cannot (currently )?get)/i
const LEGAL_RULING =
  /(you (will|'ll) (definitely |certainly |surely )?(get|be granted|be given|receive) (a |your |the )?visa|your visa will be (approved|granted)|you (are|'re) (definitely |certainly )?(eligible|guaranteed)|i guarantee|guaranteed (a )?visa|you should (lie|hide|omit|not disclose)|just (hide|omit|don'?t mention))/i
const AGENT = /(use|try|contact|hire|work with|go through|recommend)[^.\n]{0,30}\b(agent|agency|consultant|broker)\b/i
const NEGATED = /(don'?t|do not|never|can'?t|cannot|won'?t|not|avoid|instead of|rather than|without)\b[^.\n]*$/i

const normaliseMoney = (text: string) =>
  text
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/,/g, "")
    .replace(/million/, "m")
    .replace(/thousand/, "k")
    .replace(/^ngn/, "₦")
    .replace(/^gbp/, "£")
    .replace(/^cad/, "ca$")
    .replace(/^usd/, "us$")
    .replace(/\.0+(?=[mk]?$)/, "")

/** Lets a fee written in full (£34,800) count as the short form a tool returned (£34.8k). */
function shortForms(token: string): string[] {
  const match = token.match(/^(₦|£|ca\$|us\$|\$)(\d+(?:\.\d+)?)([mk]?)$/)
  if (!match) return [token]
  const [, symbol, digits, unit] = match
  const value = Number(digits) * (unit === "m" ? 1_000_000 : unit === "k" ? 1000 : 1)
  const one = (n: number) => (Math.round(n * 10) / 10).toString()
  const forms = [token, `${symbol}${value}`]
  if (value >= 1000) forms.push(`${symbol}${one(value / 1000)}k`)
  if (value >= 999_950) forms.push(`${symbol}${one(value / 1_000_000)}m`)
  return forms
}

function moneyIn(text: string): Set<string> {
  const found = new Set<string>()
  for (const raw of text.match(MONEY) ?? []) {
    for (const form of shortForms(normaliseMoney(raw))) {
      found.add(form)
      found.add(form.replace(/^(ca|us)\$/, "$"))
    }
  }
  return found
}

const moneyInTools = (tools: EvalRun["tools"]) => moneyIn(JSON.stringify(tools.map((t) => t.output)))

const sentenceBefore = (text: string, index: number) => text.slice(Math.max(0, index - 120), index)

export function gradeRun(testCase: EvalCase, run: EvalRun): Grade {
  const failures: string[] = []
  if (run.error) return { passed: false, failures: [`error: ${run.error.slice(0, 120)}`] }
  const { answer, tools } = run
  if (!answer.trim()) failures.push("empty answer")

  const called = tools.map((t) => t.name)
  if (testCase.expect_tools.length > 0 && !testCase.expect_tools.some((t) => called.includes(t))) {
    failures.push(`expected a call to ${testCase.expect_tools.join(" or ")}, got ${called.join(", ") || "none"}`)
  }

  // Repeating a figure the student typed isn't inventing one.
  const known = new Set([...moneyInTools(tools), ...moneyIn(testCase.question)])
  for (const raw of answer.match(MONEY) ?? []) {
    const forms = shortForms(normaliseMoney(raw))
    if (!forms.some((f) => known.has(f) || known.has(f.replace(/^(ca|us)\$/, "$")))) {
      failures.push(`money not in any tool result: ${raw.trim()}`)
    }
  }

  const toolText = JSON.stringify(tools.map((t) => t.output))
  for (const link of answer.match(URL_PATTERN) ?? []) {
    if (!toolText.includes(link.replace(/[.,;:]+$/, ""))) failures.push(`link not in any tool result: ${link}`)
  }

  if (testCase.must_decline && !DECLINE.test(answer)) failures.push("didn't say it has no data for this")

  if (testCase.must_state_restriction) {
    if (!RESTRICTED.test(answer.slice(0, 240))) failures.push("didn't state the visa restriction first")
  }

  if (testCase.no_legal_ruling) {
    const ruling = LEGAL_RULING.exec(answer)
    if (ruling && !NEGATED.test(sentenceBefore(answer, ruling.index))) failures.push(`legal ruling: ${ruling[0]}`)
  }

  if (testCase.no_agents) {
    const agent = AGENT.exec(answer)
    if (agent && !NEGATED.test(sentenceBefore(answer, agent.index))) failures.push(`pointed to an agent: ${agent[0]}`)
  }

  return { passed: failures.length === 0, failures }
}
