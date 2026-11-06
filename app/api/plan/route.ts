import { NextResponse } from "next/server"
import { z } from "zod"

import { supabaseServer } from "@/lib/auth/server"
import { checklistItem, trackerStage } from "@/lib/db/schemas"

const body = z.object({
  programme_id: z.uuid(),
  stage: trackerStage.optional(),
  checklist: z.array(checklistItem).max(30).optional(),
})

/** Saves a programme's stage or checklist. Runs as the student, so RLS keeps it to their own rows. */
export async function PATCH(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  const supabase = await supabaseServer()
  const { data: profile } = await supabase.from("student_profile").select("id").maybeSingle()
  if (!profile) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  const { programme_id, stage, checklist } = parsed.data
  const { error } = await supabase
    .from("application_tracker")
    .upsert(
      { student_id: profile.id, programme_id, ...(stage && { stage }), ...(checklist && { checklist }) },
      { onConflict: "student_id,programme_id" }
    )
  if (error) return NextResponse.json({ error: "Could not save" }, { status: 500 })
  return NextResponse.json({ ok: true })
}
