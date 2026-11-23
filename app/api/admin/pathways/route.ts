import { NextResponse } from "next/server"

import { audit } from "@/lib/activity/audit"
import { staffFromRequest } from "@/lib/auth/admin"
import { serviceClient } from "@/lib/db/service"
import { invalidateCatalogue, toPathways } from "@/lib/match/catalogue"
import { pathwaySchema } from "@/lib/match/pathways"
import { failureResponse } from "@/lib/server-errors"

/**
 * Creates or updates one pathway with its signal weights, atomically, and audits it with before and after.
 * Admin only (`settings`): pathways change how every student's results are ranked.
 */
export async function POST(request: Request) {
  const { user, denied } = await staffFromRequest("settings")
  if (denied) return denied
  const parsed = pathwaySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Check the values and try again" }, { status: 400 })
  const p = parsed.data
  try {
    const db = serviceClient()
    const [{ data: row }, { data: signals }] = await Promise.all([
      db.from("pathway").select("key, label, description, active, sort_order").eq("key", p.key).maybeSingle(),
      db.from("pathway_signal").select("pathway_key, signal, weight").eq("pathway_key", p.key),
    ])
    const before = row ? (toPathways([row], signals ?? [])[0] ?? null) : null
    const { error } = await db.rpc("save_pathway", {
      p_key: p.key,
      p_label: p.label,
      p_description: p.description,
      p_active: p.active,
      p_sort_order: p.sort_order,
      p_signals: p.signals,
      p_staff: user.id,
    })
    if (error) throw new Error(error.message)
    invalidateCatalogue()
    await audit(user, "pathway_changed", { targetType: "pathway", targetId: p.key, before, after: p })
    return NextResponse.json({ ok: true, created: !before })
  } catch (err) {
    return failureResponse(err)
  }
}
