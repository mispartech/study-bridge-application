import "server-only"

import { serviceClient } from "@/lib/db/service"

/**
 * NDPA erasure, the same whether the student or an admin asks: the account goes (its profile, shortlist and
 * tracker go with it), so do the reports sent to that address, and activity stops pointing at the person.
 */
export async function eraseAccount(user: { id: string; email?: string | null }): Promise<void> {
  const db = serviceClient()
  const reports = db.from("report").delete().eq("claimed_user_id", user.id)
  const byEmail = user.email ? db.from("report").delete().eq("email", user.email.toLowerCase()) : null
  const [r1, r2] = await Promise.all([reports, byEmail])
  if (r1.error) throw r1.error
  if (r2?.error) throw r2.error
  const { error } = await db.auth.admin.deleteUser(user.id)
  if (error) throw error
  const { error: anonError } = await db.rpc("anonymise_activity", { p_actor_id: user.id })
  if (anonError) console.error("anonymise_activity failed:", anonError.message)
}

/** Everything held about one person, for a data export (NDPA access request). */
export async function collectUserData(userId: string) {
  const db = serviceClient()
  const { data: auth } = await db.auth.admin.getUserById(userId)
  const user = auth?.user
  const { data: profile } = await db.from("student_profile").select("*").eq("user_id", userId).maybeSingle()
  const [shortlist, tracker, reports, payments, activity, subscription] = await Promise.all([
    profile ? db.from("shortlist").select("programme_id, created_at").eq("student_id", profile.id) : { data: [] },
    profile ? db.from("application_tracker").select("*").eq("student_id", profile.id) : { data: [] },
    db
      .from("report")
      .select("id, created_at, sent_at, reminders_consent, marketing_consent, consent_text_version, claimed_at")
      .or(
        `claimed_user_id.eq.${userId}${user?.email ? `,email.eq."${user.email.toLowerCase().replace(/"/g, "")}"` : ""}`
      ),
    db.from("payment").select("reference, amount_minor, currency, status, paid_at, created_at").eq("user_id", userId),
    db
      .from("activity_event")
      .select("occurred_at, event, target_type, target_id, properties")
      .eq("actor_id", userId)
      .order("occurred_at", { ascending: false })
      .limit(5000),
    db.from("subscription").select("plan, current_period_end").eq("user_id", userId).maybeSingle(),
  ])
  return {
    exported_at: new Date().toISOString(),
    account: user
      ? { id: user.id, email: user.email, created_at: user.created_at, last_sign_in_at: user.last_sign_in_at }
      : null,
    profile,
    subscription: subscription.data,
    shortlist: shortlist.data,
    tracker: tracker.data,
    reports: reports.data,
    payments: payments.data,
    activity: activity.data,
  }
}
