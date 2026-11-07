import { z } from "zod"

import { PublishError } from "./publish"

const WEEKS_PER_YEAR = 52
const MONTHS_PER_YEAR = 12
const CENTS = 100

const period = z.enum(["per_week", "per_month", "per_term", "per_year", "per_academic_year"])

const record = z.object({
  currency: z.enum(["GBP", "CAD", "USD"], "Currency is missing"),
  country: z.enum(["UK", "CA"]),
  city: z.string().min(1),
  university: z.object({ official_domain: z.string().min(3) }),
  accommodation: z
    .array(
      z.object({
        accommodation_type: z.enum([
          "university_halls",
          "private_studio",
          "shared_flat",
          "homestay",
          "off_campus_shared",
        ]),
        label: z.string(),
        price_low: z.number().min(0),
        price_high: z.number().min(0),
        period,
      })
    )
    .min(1, "At least one accommodation price is needed"),
  living: z.object(
    { amount: z.number().min(0), period },
    "Living costs excluding rent are missing: add them from the page"
  ),
  source_urls: z.array(z.url()).min(1),
})

/**
 * Turns a price into a monthly figure. Weekly prices are spread over the year (×52/12), because a student
 * on a 12-month course needs somewhere to live all year. Anything quoted per term or per year depends on how
 * long that is, so the reviewer converts it rather than us guessing.
 */
function monthly(amount: number, unit: z.infer<typeof period>, what: string) {
  if (unit === "per_month") return amount
  if (unit === "per_week") return (amount * WEEKS_PER_YEAR) / MONTHS_PER_YEAR
  throw new PublishError(`${what} is quoted ${unit.replace(/_/g, " ")}: change it to a weekly or monthly figure`)
}

const minor = (amount: number) => Math.round(amount * CENTS)

/** One city_cost row per accommodation type, for this university, in monthly minor units. */
export function toCityCostRows(input: unknown) {
  const parsed = record.safeParse(input)
  if (!parsed.success) {
    throw new PublishError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "))
  }
  const r = parsed.data
  const living = minor(monthly(r.living.amount, r.living.period, "Living costs"))
  type Kind = (typeof r.accommodation)[number]["accommodation_type"]
  const byType = new Map<Kind, { low: number; high: number }>()
  for (const option of r.accommodation) {
    const low = minor(monthly(option.price_low, option.period, option.label))
    const high = minor(monthly(option.price_high, option.period, option.label))
    const seen = byType.get(option.accommodation_type)
    byType.set(option.accommodation_type, {
      low: Math.min(low, seen?.low ?? low),
      high: Math.max(high, seen?.high ?? high),
    })
  }
  return {
    domain: r.university.official_domain,
    rows: [...byType.entries()].map(([accommodation_type, { low, high }]) => ({
      country: r.country,
      city: r.city,
      accommodation_type,
      rent_monthly_low_minor: low,
      rent_monthly_high_minor: Math.max(low, high),
      living_monthly_minor: living,
      currency: r.currency,
      source_url: r.source_urls[0]!,
      confidence: "university_page" as const,
      is_demo: false,
    })),
  }
}
