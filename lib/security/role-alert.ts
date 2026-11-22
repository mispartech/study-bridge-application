import "server-only"

import { serviceClient } from "@/lib/db/service"
import { sendEmail } from "@/lib/email/send"

export type RoleChange = {
  targetEmail: string
  before: string
  after: string
  /** Who made the change: a staff email, or "system". */
  by: string
  at?: Date
}

/** Every admin's address. Paged, so it keeps working as accounts grow. */
async function adminEmails(): Promise<string[]> {
  const db = serviceClient()
  const emails: string[] = []
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    for (const u of data.users) if (u.app_metadata?.role === "admin" && u.email) emails.push(u.email)
    if (data.users.length < 1000) return emails
  }
}

export function roleAlertText({ targetEmail, before, after, by, at = new Date() }: RoleChange) {
  const granted = before === "student" && after !== "student"
  return {
    subject: `Security alert: staff role ${granted ? "granted" : "changed"} for ${targetEmail}`,
    text: [
      `A StudyBridge staff role was ${granted ? "granted" : "changed"}.`,
      "",
      `Account: ${targetEmail}`,
      `Role: ${before} -> ${after}`,
      `Changed by: ${by}`,
      `When: ${at.toISOString().replace("T", " ").slice(0, 16)} UTC`,
      "",
      "If you didn't expect this, open Admin > Users now, set the role back to Student, and check the audit log.",
    ].join("\n"),
  }
}

/**
 * Emails every admin straight away when a staff role is granted or changed. Never throws: the change itself
 * has already happened and is audited, so a mail failure is logged rather than undoing it.
 */
export async function alertRoleChange(change: RoleChange): Promise<void> {
  if (change.before === change.after) return
  try {
    const { subject, text } = roleAlertText(change)
    const recipients = await adminEmails()
    const results = await Promise.all(recipients.map((to) => sendEmail({ to, subject, text })))
    if (results.some((ok) => !ok)) console.error("Some role-change alerts were not sent")
  } catch (err) {
    console.error("Role-change alert failed:", err instanceof Error ? err.message : err)
  }
}

/**
 * Claims a queued alert (once: a second claim finds nothing) and emails the admins. Called by the database
 * trigger's request with the queue id, and by the admin console right after a change, which knows who made
 * it. Whichever claims first sends; the other does nothing.
 */
export async function sendQueuedRoleAlert(match: { id: number } | { userId: string }, by = "see the audit log") {
  const db = serviceClient()
  const now = new Date().toISOString()
  let query = db.from("role_change_alert").update({ sent_at: now }).is("sent_at", null)
  query = "id" in match ? query.eq("id", match.id) : query.eq("user_id", match.userId)
  const { data, error } = await query.select("user_id, email, before_role, after_role, created_at")
  if (error) {
    console.error("Could not claim role-change alerts:", error.message)
    return 0
  }
  for (const row of data ?? []) {
    await alertRoleChange({
      targetEmail: row.email ?? row.user_id,
      before: row.before_role,
      after: row.after_role,
      by,
      at: new Date(row.created_at),
    })
  }
  return data?.length ?? 0
}
