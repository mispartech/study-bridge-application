import { NextResponse } from "next/server"
import { audit } from "@/lib/activity/audit"

import { APPROVAL_ORDER, approveItem, isReady } from "@/lib/admin/approve"
import { staffFromRequest } from "@/lib/auth/admin"
import { serviceClient } from "@/lib/db/service"
import { invalidateCatalogue } from "@/lib/match/catalogue"
import { failureResponse } from "@/lib/server-errors"

/**
 * Approves every pending record that passes validation, exactly as proposed. Programmes go first so that
 * city costs and health plans find their university. Anything that fails is left pending with the reason.
 */
export async function POST() {
  const { user, denied } = await staffFromRequest("content")
  if (denied) return denied
  try {
    const { data, error } = await serviceClient()
      .from("review_queue")
      .select("id, proposed, table_name")
      .eq("status", "pending")
    if (error) throw error
    const ready = (data ?? [])
      .filter(isReady)
      .sort((a, b) => (APPROVAL_ORDER[a.table_name] ?? 9) - (APPROVAL_ORDER[b.table_name] ?? 9))
    let approved = 0
    const failed: { id: string; error: string }[] = []
    for (const item of ready) {
      const result = await approveItem(item, user.id, item.proposed)
      if (result.ok) {
        approved += 1
        await audit(user, "record_approved", {
          targetType: item.table_name,
          targetId: item.id,
          after: { ...(result.programme_id && { programme_id: result.programme_id }), edited_fields: [] },
          reason: "Approve all ready",
        })
      } else failed.push({ id: item.id, error: result.error })
    }
    if (approved) invalidateCatalogue()
    return NextResponse.json({ approved, failed, skipped: (data?.length ?? 0) - ready.length })
  } catch (err) {
    return failureResponse(err)
  }
}
