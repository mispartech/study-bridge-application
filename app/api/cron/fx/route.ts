import { timingSafeEqual } from "node:crypto"

import { NextResponse } from "next/server"

import { refreshReferenceRates } from "@/lib/fx/reference-rates"
import { invalidateCatalogue } from "@/lib/match/catalogue"

function authorised(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const given = Buffer.from(request.headers.get("authorization") ?? "")
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/** Daily backstop. Matching also refreshes the rate whenever it's over an hour old. */
export async function GET(request: Request) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  const result = await refreshReferenceRates()
  if (result === "refreshed") invalidateCatalogue()
  return NextResponse.json({ result }, { status: result === "failed" ? 502 : 200 })
}
