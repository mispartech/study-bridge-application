import { NextResponse } from "next/server"

import { audit } from "@/lib/activity/audit"
import { OFFICIAL_CONFIDENCE, occupationInput, SYSTEM } from "@/lib/admin/careers"
import { staffFromRequest } from "@/lib/auth/admin"
import { serviceClient } from "@/lib/db/service"
import { invalidateCatalogue } from "@/lib/match/catalogue"
import { failureResponse } from "@/lib/server-errors"

/** Adds or re-verifies an occupation, and optionally its demand in one place. Content staff; audited. */
export async function POST(request: Request) {
  const { user, denied } = await staffFromRequest("content")
  if (denied) return denied
  const parsed = occupationInput.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the form" }, { status: 400 })
  }
  const { country, code, title, source_url, demand } = parsed.data
  const stamp = { last_verified_at: new Date().toISOString(), confidence: OFFICIAL_CONFIDENCE }
  try {
    const db = serviceClient()
    const system = SYSTEM[country]
    const { data: before } = await db
      .from("occupation")
      .select("*, occupation_demand(*)")
      .eq("system", system)
      .eq("code", code)
      .maybeSingle()
    const { data: saved, error } = await db
      .from("occupation")
      .upsert({ country, system, code, title, source_url, ...stamp }, { onConflict: "system,code" })
      .select("id")
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 422 })
    let demandError: string | null = null
    if (demand) {
      const result = await db
        .from("occupation_demand")
        .upsert({ occupation_id: saved.id, ...demand, ...stamp }, { onConflict: "occupation_id,region,source_type" })
      demandError = result.error?.message ?? null
    }
    await audit(user, "career_data_changed", {
      targetType: "occupation",
      targetId: saved.id,
      before,
      after: { ...parsed.data, demand: demandError ? null : demand },
    })
    invalidateCatalogue()
    if (demandError) {
      return NextResponse.json({ error: `The occupation saved, but not its demand: ${demandError}` }, { status: 422 })
    }
    return NextResponse.json({ ok: true, id: saved.id })
  } catch (err) {
    return failureResponse(err)
  }
}
