import { NextResponse } from "next/server"
import { z } from "zod"

import { adminFromRequest } from "@/lib/auth/admin"
import { confidenceLevel, countryCode, visaRuleType } from "@/lib/db/schemas"
import { serviceClient } from "@/lib/db/service"
import { invalidateCatalogue } from "@/lib/match/catalogue"
import type { Json } from "@/lib/db/database.types"
import { failureResponse } from "@/lib/server-errors"

const fields = z.object({
  description: z.string().trim().min(5),
  value: z.json().refine((v) => v !== null, "Value can't be empty"),
  effective_from: z.iso.date(),
  effective_to: z.iso.date().nullable(),
  source_url: z.url({ protocol: /^https$/ }),
  confidence: confidenceLevel,
})
const created = fields.extend({ country: countryCode, rule_type: visaRuleType })
const edited = fields.extend({ id: z.uuid() })

const stamp = () => ({ last_verified_at: new Date().toISOString() })

export async function POST(request: Request) {
  const { denied } = await adminFromRequest()
  if (denied) return denied
  const parsed = created.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Check the form and try again" }, { status: 400 })
  try {
    const { error } = await serviceClient()
      .from("visa_rule")
      .insert({ ...parsed.data, value: parsed.data.value as NonNullable<Json>, ...stamp() })
    if (error) return NextResponse.json({ error: error.message }, { status: 422 })
    invalidateCatalogue()
    return NextResponse.json({ ok: true })
  } catch (err) {
    return failureResponse(err)
  }
}

export async function PATCH(request: Request) {
  const { denied } = await adminFromRequest()
  if (denied) return denied
  const parsed = edited.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Check the form and try again" }, { status: 400 })
  const { id, ...rest } = parsed.data
  try {
    const { error } = await serviceClient()
      .from("visa_rule")
      .update({ ...rest, value: rest.value as NonNullable<Json>, ...stamp() })
      .eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 422 })
    invalidateCatalogue()
    return NextResponse.json({ ok: true })
  } catch (err) {
    return failureResponse(err)
  }
}
