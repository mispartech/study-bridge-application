import { NextResponse } from "next/server"
import { z } from "zod"

import { audit } from "@/lib/activity/audit"
import { institutionInput } from "@/lib/admin/careers"
import { staffFromRequest } from "@/lib/auth/admin"
import { serviceClient } from "@/lib/db/service"
import { invalidateCatalogue } from "@/lib/match/catalogue"
import { failureResponse } from "@/lib/server-errors"

/** Records an institution's type, DLI number and work-permit eligibility, as checked today. Audited. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, denied } = await staffFromRequest("content")
  if (denied) return denied
  const { id } = await params
  const parsed = institutionInput.safeParse(await request.json().catch(() => null))
  if (!parsed.success || !z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: parsed.error?.issues[0]?.message ?? "Check the form" }, { status: 400 })
  }
  try {
    const db = serviceClient()
    const { data: before } = await db
      .from("university")
      .select("country, institution_type, dli_number, pgwp_eligible, pgwp_source_url, pgwp_checked_at")
      .eq("id", id)
      .eq("is_demo", false)
      .maybeSingle()
    if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (parsed.data.dli_number && before.country !== "CA") {
      return NextResponse.json({ error: "Only Canadian institutions have a DLI number" }, { status: 422 })
    }
    const known = parsed.data.pgwp_eligible !== "unknown"
    const after = { ...parsed.data, pgwp_checked_at: known ? new Date().toISOString() : null }
    const { error } = await db.from("university").update(after).eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 422 })
    await audit(user, "institution_changed", { targetType: "university", targetId: id, before, after })
    invalidateCatalogue()
    return NextResponse.json({ ok: true })
  } catch (err) {
    return failureResponse(err)
  }
}
