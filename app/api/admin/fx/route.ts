import { NextResponse } from "next/server"
import { z } from "zod"

import { adminFromRequest } from "@/lib/auth/admin"
import { serviceClient } from "@/lib/db/service"
import { invalidateCatalogue } from "@/lib/match/catalogue"
import { failureResponse } from "@/lib/server-errors"

const body = z.object({
  currency: z.enum(["GBP", "CAD", "USD"]),
  rate: z.number().positive().max(100_000),
  source_url: z.url({ protocol: /^https$/ }),
  observed_on: z.iso.date(),
})

/** A weekly market rate, typed in by an admin. Each one is audited: who, when, and from where. */
export async function POST(request: Request) {
  const { user, denied } = await adminFromRequest()
  if (denied) return denied
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Check the rate, date and source" }, { status: 400 })
  const { currency, rate, source_url, observed_on } = parsed.data
  try {
    const db = serviceClient()
    const fetched_at = new Date(`${observed_on}T12:00:00+01:00`).toISOString()
    const { data, error } = await db
      .from("fx_rate")
      .insert({ base: currency, quote: "NGN", rate, rate_kind: "market", fetched_at, source_url, entered_by: user.id })
      .select("id")
      .single()
    if (error) throw error
    const { error: auditError } = await db.from("source_audit").insert({
      table_name: "fx_rate",
      record_id: data.id,
      source_url,
      fetched_at,
      change_detected: true,
      diff: { currency, rate, rate_kind: "market" },
      verified_by: user.email ?? user.id,
      approved_at: new Date().toISOString(),
    })
    if (auditError) throw auditError
    invalidateCatalogue()
    return NextResponse.json({ ok: true })
  } catch (err) {
    return failureResponse(err)
  }
}
