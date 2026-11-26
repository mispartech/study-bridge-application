import { NextResponse } from "next/server"
import { z } from "zod"

import { audit } from "@/lib/activity/audit"
import { fundingInput, linkProblem, toFundingRow } from "@/lib/admin/funding"
import { staffFromRequest } from "@/lib/auth/admin"
import { serviceClient } from "@/lib/db/service"
import { invalidateCatalogue } from "@/lib/match/catalogue"
import { failureResponse } from "@/lib/server-errors"

const edited = z.object({ id: z.uuid(), record: fundingInput })

async function check(record: z.infer<typeof fundingInput>) {
  if (!record.university_id) return null
  const { data } = await serviceClient()
    .from("university")
    .select("official_domains")
    .eq("id", record.university_id)
    .maybeSingle()
  if (!data) return "That institution isn't in the database"
  return linkProblem(record, data.official_domains)
}

/** Adds a funding record. Data editors and admins; audited. */
export async function POST(request: Request) {
  const { user, denied } = await staffFromRequest("content")
  if (denied) return denied
  const parsed = fundingInput.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the form" }, { status: 400 })
  }
  try {
    const problem = await check(parsed.data)
    if (problem) return NextResponse.json({ error: problem }, { status: 422 })
    const { data, error } = await serviceClient()
      .from("scholarship")
      .insert(toFundingRow(parsed.data, new Date()))
      .select("id")
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 422 })
    await audit(user, "funding_changed", { targetType: "scholarship", targetId: data.id, after: parsed.data })
    invalidateCatalogue()
    return NextResponse.json({ ok: true, id: data.id })
  } catch (err) {
    return failureResponse(err)
  }
}

/** Edits a funding record (saving marks it verified today). Data editors and admins; audited with before/after. */
export async function PATCH(request: Request) {
  const { user, denied } = await staffFromRequest("content")
  if (denied) return denied
  const parsed = edited.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the form" }, { status: 400 })
  }
  const { id, record } = parsed.data
  try {
    const problem = await check(record)
    if (problem) return NextResponse.json({ error: problem }, { status: 422 })
    const db = serviceClient()
    const { data: before } = await db.from("scholarship").select("*").eq("id", id).eq("is_demo", false).maybeSingle()
    if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const { error } = await db.from("scholarship").update(toFundingRow(record, new Date())).eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 422 })
    await audit(user, "funding_changed", { targetType: "scholarship", targetId: id, before, after: record })
    invalidateCatalogue()
    return NextResponse.json({ ok: true })
  } catch (err) {
    return failureResponse(err)
  }
}
