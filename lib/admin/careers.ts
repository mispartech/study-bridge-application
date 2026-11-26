import { z } from "zod"

import { confidenceLevel } from "@/lib/db/schemas"

/** What data editors enter for careers and work permits (docs/CANADA_V1_PLAN.md, step E). */

/** Government sites facts may come from. */
const OFFICIAL_HOSTS = [
  "canada.ca",
  "gc.ca",
  "ontario.ca",
  "novascotia.ca",
  "novascotiaimmigration.com",
  "liveinnovascotia.com",
  "gov.bc.ca",
  "welcomebc.ca",
  "workbc.ca",
  "gov.uk",
]
export function isOfficialSource(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url)
    return protocol === "https:" && OFFICIAL_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`))
  } catch {
    return false
  }
}
const officialUrl = z.string().refine(isOfficialSource, "Use an https link on an official government website")
const period = { from: z.iso.date(), to: z.iso.date().nullable().default(null) }

export const DEMAND_TYPE_LABEL = {
  in_demand_list: "In-demand list",
  nominee_stream: "Provincial nominee stream",
  job_outlook: "Job outlook",
  shortage_list: "Shortage list",
} as const

const CODE = { CA: /^\d{5}$/, UK: /^\d{4}$/, US: /^\d{2}-\d{4}$/ }
export const SYSTEM = { CA: "NOC2021", UK: "SOC2020", US: "SOC2018" } as const

export const occupationInput = z
  .object({
    country: z.enum(["UK", "CA", "US"]),
    code: z.string().trim(),
    title: z.string().trim().min(2).max(200),
    source_url: officialUrl,
    /** Optional: record demand at the same time. */
    demand: z
      .object({
        region: z.string().trim().max(60).default(""),
        source_type: z.enum(["in_demand_list", "nominee_stream", "job_outlook", "shortage_list"]),
        label: z.string().trim().min(2).max(160),
        valid_from: period.from,
        valid_to: period.to,
        source_url: officialUrl,
      })
      .refine((d) => d.valid_to === null || d.valid_to >= d.valid_from, "The end date is before the start date")
      .nullable()
      .default(null),
  })
  .refine((o) => CODE[o.country].test(o.code), {
    message: "Use a 5-digit NOC (Canada), 4-digit SOC (UK) or NN-NNNN SOC (US) code",
    path: ["code"],
  })

const fieldRow = z.object({
  code: z.string().regex(/^\d{2}\.\d{4}$/),
  title: z.string().min(2).max(200),
  category: z.string().min(2).max(100),
})
export type FieldRow = z.infer<typeof fieldRow>

/** Pasted lines of "code | title | category" (or tab-separated). All or nothing, so a list is never half-saved. */
export function parseFieldLines(text: string): { rows: FieldRow[]; errors: string[] } {
  const rows = new Map<string, FieldRow>()
  const errors: string[] = []
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return
    const [code, title, category] = line.split(/\t|\|/).map((part) => part.trim())
    const parsed = fieldRow.safeParse({ code, title, category })
    if (!parsed.success) errors.push(`Line ${i + 1}: expected "11.0701 | Computer science | STEM"`)
    else if (rows.has(parsed.data.code)) errors.push(`Line ${i + 1}: ${parsed.data.code} is listed twice`)
    else rows.set(parsed.data.code, parsed.data)
  })
  return { rows: [...rows.values()], errors }
}

export const fieldImport = z
  .object({
    country: z.enum(["UK", "CA", "US"]),
    lines: z.string().min(1).max(400_000),
    eligible_from: period.from,
    eligible_to: period.to,
    source_url: officialUrl,
  })
  .refine((f) => f.eligible_to === null || f.eligible_to >= f.eligible_from, "The end date is before the start date")

const link = z.object({ programme_id: z.uuid(), occupation_id: z.uuid() })
export const linkAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("suggest"), programme_id: z.uuid() }),
  link.extend({ action: z.literal("add") }),
  z.object({ action: z.enum(["approve", "reject"]), links: z.array(link).min(1).max(50) }),
])

export const institutionInput = z
  .object({
    institution_type: z.enum(["university", "public_college", "private_college"]),
    dli_number: z
      .string()
      .trim()
      .regex(/^O\d{8,14}$/, "A DLI number is the letter O and digits")
      .nullable(),
    pgwp_eligible: z.enum(["yes", "no", "unknown"]),
    pgwp_source_url: officialUrl.nullable(),
  })
  .refine((i) => i.pgwp_eligible === "unknown" || i.pgwp_source_url !== null, {
    message: "Give the official page you checked",
    path: ["pgwp_source_url"],
  })

export const OFFICIAL_CONFIDENCE = confidenceLevel.enum.official

type Suggestion = { occupation_id: string; rationale: string }

/** Keeps only suggestions that name an occupation we offered, once each: the model can't add its own. */
export function validSuggestions(suggestions: Suggestion[], offered: ReadonlySet<string>): Suggestion[] {
  const kept = new Map<string, Suggestion>()
  for (const s of suggestions)
    if (offered.has(s.occupation_id) && !kept.has(s.occupation_id)) kept.set(s.occupation_id, s)
  return [...kept.values()]
}
