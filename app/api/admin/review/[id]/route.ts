import { NextResponse } from "next/server"
import { z } from "zod"

import { changedFields } from "@/lib/admin/field-changes"
import { PublishError, toRows } from "@/lib/admin/publish"
import { adminFromRequest } from "@/lib/auth/admin"
import type { Json } from "@/lib/db/database.types"
import { serviceClient } from "@/lib/db/service"
import { invalidateCatalogue } from "@/lib/match/catalogue"
import { failureResponse } from "@/lib/server-errors"

const body = z.object({ action: z.enum(["approve", "reject"]), record: z.json() })

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
    const rows = toRows(record)
    const { data: item } = await db.from("review_queue").select("proposed").eq("id", id).maybeSingle()
    const { data, error } = await db.rpc("publish_review_item", {
      p_review_id: id,
      p_reviewer: user.id,
      p_university: rows.university as unknown as Json,
      p_programme: rows.programme as unknown as Json,
      p_requirement: rows.requirement as unknown as Json,
      p_intakes: rows.intakes as unknown as Json,
      p_fees: rows.fees as unknown as Json,
      p_field_changes: changedFields(item?.proposed ?? null, record),
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 422 })
    invalidateCatalogue()
    return NextResponse.json({ ok: true, programme_id: data })
  } catch (err) {
    if (err instanceof PublishError) return NextResponse.json({ error: err.message }, { status: 422 })
    return failureResponse(err)
  }
}
