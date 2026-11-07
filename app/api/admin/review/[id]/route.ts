import { NextResponse } from "next/server"
import { z } from "zod"

import { changedFields } from "@/lib/admin/field-changes"
import { toCityCostRows } from "@/lib/admin/city-costs"
import { PublishError, toRows } from "@/lib/admin/publish"
import { adminFromRequest } from "@/lib/auth/admin"
import type { Json } from "@/lib/db/database.types"
import { serviceClient } from "@/lib/db/service"
import { invalidateCatalogue } from "@/lib/match/catalogue"
import { failureResponse } from "@/lib/server-errors"

const body = z.object({ action: z.enum(["approve", "reject"]), record: z.json() })

/** A university's own costs replace its previous ones. The university must already be published. */
async function publishCityCosts(id: string, reviewer: string, proposed: unknown, record: unknown) {
  const { domain, rows } = toCityCostRows(record)
  const db = serviceClient()
  const { data: university } = await db
    .from("university")
    .select("id")
    .eq("is_demo", false)
    .contains("official_domains", [domain])
    .maybeSingle()
  if (!university) {
    return NextResponse.json({ error: "Approve a programme from this university first" }, { status: 422 })
  }
  const now = new Date().toISOString()
  const { error: removeError } = await db.from("city_cost").delete().eq("university_id", university.id)
  if (removeError) throw removeError
  const { error } = await db
    .from("city_cost")
    .insert(rows.map((row) => ({ ...row, university_id: university.id, last_verified_at: now })))
  if (error) return NextResponse.json({ error: error.message }, { status: 422 })
  const { error: reviewError } = await db
    .from("review_queue")
    .update({
      status: "approved",
      reviewed_by: reviewer,
      reviewed_at: now,
      field_changes: changedFields(proposed, record),
    })
    .eq("id", id)
    .eq("status", "pending")
  if (reviewError) throw reviewError
  invalidateCatalogue()
  return NextResponse.json({ ok: true })
}

/** Approving publishes the reviewed record in one transaction. Rejecting publishes nothing. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, denied } = await adminFromRequest()
  if (denied) return denied
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  const { id } = await params
  const { action, record } = parsed.data
  try {
    const db = serviceClient()
    if (action === "reject") {
      const { error } = await db
        .from("review_queue")
        .update({ status: "rejected", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "pending")
      if (error) throw error
      return NextResponse.json({ ok: true })
    }
    const { data: item } = await db.from("review_queue").select("proposed, table_name").eq("id", id).maybeSingle()
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (item.table_name === "city_cost") return publishCityCosts(id, user.id, item.proposed, record)
    const rows = toRows(record)
    const { data, error } = await db.rpc("publish_review_item", {
      p_review_id: id,
      p_reviewer: user.id,
      p_university: rows.university as unknown as Json,
      p_programme: rows.programme as unknown as Json,
      p_requirement: rows.requirement as unknown as Json,
      p_intakes: rows.intakes as unknown as Json,
      p_fees: rows.fees as unknown as Json,
      p_field_changes: changedFields(item.proposed, record),
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 422 })
    invalidateCatalogue()
    return NextResponse.json({ ok: true, programme_id: data })
  } catch (err) {
    if (err instanceof PublishError) return NextResponse.json({ error: err.message }, { status: 422 })
    return failureResponse(err)
  }
}
