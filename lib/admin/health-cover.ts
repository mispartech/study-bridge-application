import { z } from "zod"

import { PublishError } from "./publish"

const CENTS = 100

const record = z.object({
  plan_name: z.string().min(2),
  university: z.object({ official_domain: z.string().min(3) }),
  country: z.enum(["UK", "CA"]),
  amount: z.number("The plan's cost is missing").positive(),
  currency: z.enum(["GBP", "CAD", "USD"]),
  period: z.enum(["per_year", "per_academic_year", "per_term", "per_month"]),
  compulsory: z.boolean(),
  source_urls: z.array(z.url()).min(1),
})

/**
 * A university's compulsory health plan as a cost estimate. Yearly prices are stored per year of study;
 * other periods need the reviewer to convert them, since a term's length varies.
 */
export function toHealthCoverRow(input: unknown) {
  const parsed = record.safeParse(input)
  if (!parsed.success) {
    throw new PublishError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "))
  }
  const r = parsed.data
  if (r.period !== "per_year" && r.period !== "per_academic_year") {
    throw new PublishError(`The plan is priced ${r.period.replace(/_/g, " ")}: change it to a yearly amount`)
  }
  if (!r.compulsory) throw new PublishError("Only compulsory university plans replace the province's figure")
  return {
    domain: r.university.official_domain,
    row: {
      country: r.country,
      item: "health_cover" as const,
      amount_minor: Math.round(r.amount * CENTS),
      currency: r.currency,
      per_year: true,
      source_url: r.source_urls[0]!,
      confidence: "university_page" as const,
      is_demo: false,
    },
  }
}
