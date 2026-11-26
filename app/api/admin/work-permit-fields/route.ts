import { NextResponse } from "next/server"

import { audit } from "@/lib/activity/audit"
import { fieldImport, OFFICIAL_CONFIDENCE, parseFieldLines } from "@/lib/admin/careers"
import { staffFromRequest } from "@/lib/auth/admin"
import { serviceClient } from "@/lib/db/service"
import { invalidateCatalogue } from "@/lib/match/catalogue"
import { failureResponse } from "@/lib/server-errors"

export const maxDuration = 60
const MAX_ROWS = 1000
const AUDIT_BATCH = 25

/** Adds or re-verifies a list of work-permit fields in one statement. One audit row per field, one for the list. */
export async function POST(request: Request) {
  const { user, denied } = await staffFromRequest("content")
  if (denied) return denied
  const parsed = fieldImport.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the form" }, { status: 400 })
  }
  const { rows, errors } = parseFieldLines(parsed.data.lines)
  if (errors.length || rows.length === 0 || rows.length > MAX_ROWS) {
    return NextResponse.json({ error: errors.slice(0, 5).join(". ") || "Paste 1 to 1,000 fields" }, { status: 400 })
  }
  const { country, eligible_from, eligible_to, source_url } = parsed.data
  const last_verified_at = new Date().toISOString()
  try {
    const db = serviceClient()
    const { data: existing, error: readError } = await db.from("work_permit_field").select("*").eq("country", country)
    if (readError) return NextResponse.json({ error: readError.message }, { status: 422 })
    const before = new Map((existing ?? []).map((f) => [f.code, f]))
    const { data: saved, error } = await db
      .from("work_permit_field")
      .upsert(
        rows.map((r) => ({
          ...r,
          country,
          eligible_from,
          eligible_to,
          source_url,
          last_verified_at,
          confidence: OFFICIAL_CONFIDENCE,
        })),
        { onConflict: "country,code" }
      )
      .select("id, code, title, category, eligible_from, eligible_to, source_url")
    if (error) return NextResponse.json({ error: error.message }, { status: 422 })
    for (let i = 0; i < saved.length; i += AUDIT_BATCH) {
      await Promise.all(
        saved.slice(i, i + AUDIT_BATCH).map((field) =>
          audit(user, "career_data_changed", {
            targetType: "work_permit_field",
            targetId: field.id,
            before: before.get(field.code) ?? null,
            after: field,
          })
        )
      )
    }
    await audit(user, "career_data_changed", {
      targetType: "work_permit_field_list",
      targetId: country,
      after: { saved: saved.length, source_url },
    })
    invalidateCatalogue()
    return NextResponse.json({ ok: true, saved: saved.length })
  } catch (err) {
    return failureResponse(err)
  }
}
