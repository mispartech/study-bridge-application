import { after, NextResponse } from "next/server"
import { z } from "zod"

import { audit } from "@/lib/activity/audit"
import { staffFromRequest } from "@/lib/auth/admin"
import { serviceClient } from "@/lib/db/service"
import { matchProfile, rank } from "@/lib/match"
import { demoModeEnabled, loadCatalogue } from "@/lib/match/catalogue"
import { presentResult } from "@/lib/match/present"
import { deliverReport } from "@/lib/report/send"
import { failureResponse } from "@/lib/server-errors"

const body = z.object({ action: z.enum(["resend", "delete", "block"]) })

/**
 * Emailed report actions. Resending (support and admin) rebuilds it with today's figures. Deleting it, or
 * blocking the address from ever getting another, needs an admin. All are audited.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  const { action } = parsed.data
  const { user, denied } = await staffFromRequest(action === "resend" ? "users.manage" : "users.erase")
  if (denied) return denied
  const { id } = await params
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 })
  try {
    const db = serviceClient()
    const { data: report } = await db
      .from("report")
      .select("id, email, email_hash, profile_snapshot")
      .eq("id", id)
      .maybeSingle()
    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 })

    if (action === "resend") {
      const profile = matchProfile.safeParse(report.profile_snapshot)
      if (!profile.success) {
        return NextResponse.json({ error: "This report's profile can't be read" }, { status: 422 })
      }
      const demoMode = demoModeEnabled()
      const catalogue = await loadCatalogue(demoMode)
      const now = new Date()
      const result = rank(profile.data, catalogue, { now, demoMode })
      const view = presentResult(result, profile.data, catalogue, now)
      const { error } = await db.from("report").update({ delivery_status: "queued" }).eq("id", id)
      if (error) throw error
      const origin = new URL(request.url).origin
      after(() =>
        deliverReport({
          reportId: id,
          email: report.email,
          origin,
          profile: profile.data,
          result,
          view,
          catalogue,
          now,
        })
      )
      await audit(user, "report_resent", { targetType: "report", targetId: id })
      return NextResponse.json({ ok: true })
    }

    if (action === "block") {
      const { error } = await db
        .from("blocked_email")
        .upsert({ email_hash: report.email_hash, created_by: user.id }, { onConflict: "email_hash" })
      if (error) throw error
      await audit(user, "email_blocked", { targetType: "report", targetId: id })
    }
    const { error } = await db.from("report").delete().eq("id", id)
    if (error) throw error
    if (action === "delete") await audit(user, "report_deleted", { targetType: "report", targetId: id })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return failureResponse(err)
  }
}
