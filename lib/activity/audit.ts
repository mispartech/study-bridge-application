import "server-only"

import type { User } from "@supabase/supabase-js"

import type { Json } from "@/lib/db/database.types"
import { serviceClient } from "@/lib/db/service"

/** Staff actions recorded in the audit log (docs/SPEC_ACCESS_ADMIN.md, section 4). */
export type AuditAction =
  | "user_viewed"
  | "user_suspended"
  | "user_deleted"
  | "role_changed"
  | "report_resent"
  | "record_approved"
  | "record_edited"
  | "record_rejected"
  | "visa_rule_changed"
  | "advisor_conversation_opened"
  | "refund_issued"
  | "export_downloaded"
  | "setting_changed"
  | "market_rate_entered"
  | "estimate_entered"
  | "error_report_updated"
  | "user_unsuspended"
  | "link_resent"
  | "report_deleted"
  | "email_blocked"

/**
 * Records one staff action with what changed. The table refuses edits and deletes. Failing to record is
 * logged loudly but doesn't undo the action, which has already happened by the time this runs.
 */
export async function audit(
  staff: Pick<User, "id" | "email">,
  action: AuditAction,
  details: { targetType?: string; targetId?: string; before?: unknown; after?: unknown; reason?: string } = {}
): Promise<void> {
  const { error } = await serviceClient()
    .from("staff_audit")
    .insert({
      staff_id: staff.id,
      staff_email: staff.email ?? null,
      action,
      target_type: details.targetType ?? null,
      target_id: details.targetId ?? null,
      before: (details.before ?? null) as Json,
      after: (details.after ?? null) as Json,
      reason: details.reason ?? null,
    })
  if (error) console.error(`AUDIT WRITE FAILED for ${action} by ${staff.id}:`, error.message)
}
