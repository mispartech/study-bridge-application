import { z } from "zod"

import { fieldCode } from "@/lib/db/schemas"

/**
 * A funding record as a data editor enters it (docs/CANADA_V1_PLAN.md, step D). Shared by the admin form and
 * the admin API. Facts come from the funder's own page: the source link is required, international eligibility
 * must be stated (never assumed), and money is entered in major units and stored in minor units.
 */

export const FUNDING_TYPES = ["scholarship", "bursary", "entrance_award", "tuition_waiver", "grant"] as const
export const FUNDING_TYPE_LABEL: Record<(typeof FUNDING_TYPES)[number], string> = {
  scholarship: "Scholarship",
  bursary: "Bursary",
  entrance_award: "Entrance award",
  tuition_waiver: "Tuition waiver",
  grant: "Grant",
}
export const INTERNATIONAL_LABEL = {
  yes: "Open to international",
  limited: "Few international places",
  no: "Not open to international",
} as const

const https = z.url({ protocol: /^https$/, error: "Use the official https:// link" })
const list = <T extends z.ZodType>(item: T) => z.array(item).max(50).default([])

export const fundingInput = z
  .object({
    name: z.string().trim().min(3).max(160),
    funder: z.string().trim().min(2).max(160),
    funding_type: z.enum(FUNDING_TYPES),
    countries: z.array(z.enum(["UK", "CA", "US"])).min(1, "Choose at least one country"),
    regions: list(z.string().trim().min(2).max(60)),
    university_id: z.uuid().nullable().default(null),
    levels: list(z.enum(["masters", "postgraduate_certificate", "graduate_diploma", "diploma"])),
    fields: list(fieldCode),
    eligible_nationalities: list(z.string().regex(/^[A-Z]{2}$/, "Nationalities are 2-letter codes, e.g. NG")),
    min_uk_class: z.enum(["first", "upper_second", "lower_second", "third", "pass"]).nullable().default(null),
    open_to_international: z.enum(["yes", "limited", "no"], "Say whether international students can get it"),
    eligible_from: z.enum(["admission", "after_start"]),
    automatic: z.boolean().default(false),
    coverage: z.enum(["full", "tuition", "partial", "stipend"]),
    amount: z.number().positive().max(10_000_000).nullable().default(null),
    currency: z.enum(["GBP", "CAD", "USD"]).nullable().default(null),
    percent_of_tuition: z.number().int().min(1).max(100).nullable().default(null),
    renewable: z.boolean().default(false),
    deadline: z.iso.date().nullable().default(null),
    url: https,
    source_url: https,
    confidence: z.enum(["official", "university_page", "third_party", "estimated"]),
  })
  .refine((f) => (f.amount === null) === (f.currency === null), {
    message: "An amount needs its currency, and a currency needs an amount",
    path: ["currency"],
  })
  .refine((f) => !(f.amount !== null && f.percent_of_tuition !== null), {
    message: "Give an amount or a share of tuition, not both",
    path: ["percent_of_tuition"],
  })

export type FundingInput = z.infer<typeof fundingInput>

const hostOf = (url: string) => new URL(url).hostname.toLowerCase()
const onDomain = (host: string, domains: readonly string[]) =>
  domains.some((d) => host === d.toLowerCase() || host.endsWith(`.${d.toLowerCase()}`))

/** An institution's own funding must link to that institution's official site, like apply links. */
export function linkProblem(input: FundingInput, officialDomains: readonly string[] | null): string | null {
  if (!input.university_id || !officialDomains) return null
  return onDomain(hostOf(input.url), officialDomains) ? null : "The link must be on the institution's official website"
}

/** The scholarship row for an input: minor units, verified now. */
export function toFundingRow(input: FundingInput, now: Date) {
  const { amount, ...rest } = input
  return {
    ...rest,
    amount_minor: amount === null ? null : Math.round(amount * 100),
    last_verified_at: now.toISOString(),
    is_demo: false,
  }
}
