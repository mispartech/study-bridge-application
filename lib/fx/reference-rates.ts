import "server-only"

import { z } from "zod"

import { serviceClient } from "@/lib/db/service"

// The reference ("official" kind) rate. The CBN publishes the NFEM rate, but its rates page fills its table
// with JavaScript and offers no feed we can read, so until it does we use a mid-market rate from
// ExchangeRate-API's open endpoint (free, no key, attribution required). Market rates are entered weekly
// by an admin in /admin/fx.
export const REFERENCE_SOURCE = "https://www.exchangerate-api.com"
const ENDPOINT = "https://open.er-api.com/v6/latest/NGN"
const CURRENCIES = ["GBP", "CAD", "USD"] as const
export const REFRESH_MS = 60 * 60 * 1000
const RATE_DECIMALS = 4

const response = z.object({
  result: z.literal("success"),
  time_last_update_unix: z.number(),
  rates: z.record(z.string(), z.number().positive()),
})

/** Naira per unit of each currency, from the provider's naira-based quote. */
export function nairaPerUnit(rates: Record<string, number>) {
  return CURRENCIES.map((currency) => {
    const perNaira = rates[currency]
    if (!perNaira) throw new Error(`No ${currency} rate in the response`)
    return { currency, rate: Number((1 / perNaira).toFixed(RATE_DECIMALS)) }
  })
}

/** Stores a fresh reference rate unless the newest one is under an hour old. Never throws. */
export async function refreshReferenceRates(now = new Date()) {
  try {
    const db = serviceClient()
    const { data: latest } = await db
      .from("fx_rate")
      .select("fetched_at")
      .eq("rate_kind", "official")
      .eq("is_demo", false)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (latest && now.getTime() - new Date(latest.fetched_at).getTime() < REFRESH_MS) return "fresh"
    const res = await fetch(ENDPOINT, { cache: "no-store" })
    const body = response.parse(await res.json())
    const fetched_at = new Date(body.time_last_update_unix * 1000).toISOString()
    const rows = nairaPerUnit(body.rates).map(({ currency, rate }) => ({
      base: currency,
      quote: "NGN" as const,
      rate,
      rate_kind: "official",
      fetched_at,
      source_url: REFERENCE_SOURCE,
      is_demo: false,
    }))
    const { error } = await db.from("fx_rate").insert(rows)
    if (error) throw error
    return "refreshed"
  } catch (err) {
    console.error("Reference rate refresh failed:", err instanceof Error ? err.message : err)
    return "failed"
  }
}
