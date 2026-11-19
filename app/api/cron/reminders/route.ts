import { timingSafeEqual } from "node:crypto"
import { logCronRun } from "@/lib/admin/cron-log"
import { recordActivity } from "@/lib/activity/record"

import { NextResponse } from "next/server"

import { serviceClient } from "@/lib/db/service"
import { sendEmail } from "@/lib/email/send"
import { changeReminders, deadlineReminders, type WatchedProgramme } from "@/lib/plan/reminders"

const DAY_MS = 86_400_000
/** Tables whose rows point at a programme; requirement is keyed by programme_id itself. */
const CHILD_TABLES: Record<string, "intake" | "fee"> = { intake: "intake", fee: "fee" }

function authorised(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const given = Buffer.from(request.headers.get("authorization") ?? "")
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/** Runs daily, so a change detected by ingestion reaches affected students within 24 hours. */
export async function GET(request: Request) {
  if (!authorised(request)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 })
  const db = serviceClient()
  const now = new Date()
  const started = now

  // Retention: an emailed report nobody opened is deleted after 12 months (docs/SPEC_ACCESS_ADMIN.md, s2).
  const { count: expiredReports, error: expiryError } = await db
    .from("report")
    .delete({ count: "exact" })
    .is("claimed_user_id", null)
    .lt("expires_at", now.toISOString())
  if (expiryError) console.error("report expiry failed:", expiryError.message)

  const [{ data: saved, error }, { data: intakes }, { data: trackers }] = await Promise.all([
    db
      .from("shortlist")
      .select("student_id, programme_id, programme(title), student_profile(user_id, consent_given_at)"),
    db.from("intake").select("programme_id, deadlines"),
    db.from("application_tracker").select("student_id, programme_id, stage"),
  ])
  if (error) return NextResponse.json({ error: "Could not read shortlists" }, { status: 500 })

  const watched: WatchedProgramme[] = (saved ?? []).flatMap((row) => {
    const profile = row.student_profile
    if (!profile?.consent_given_at) return []
    const tracker = trackers?.find((t) => t.student_id === row.student_id && t.programme_id === row.programme_id)
    return {
      user_id: profile.user_id,
      programme_id: row.programme_id,
      title: row.programme?.title ?? "your programme",
      stage: tracker?.stage ?? "researching",
      deadlines: (intakes ?? [])
        .filter((i) => i.programme_id === row.programme_id)
        .flatMap((i) => (i.deadlines ?? []) as { label: string; date: string }[]),
    }
  })

  const since = new Date(now.getTime() - DAY_MS).toISOString()
  const { data: audits } = await db
    .from("source_audit")
    .select("id, table_name, record_id")
    .eq("change_detected", true)
    .gte("created_at", since)
  const changes = await Promise.all(
    (audits ?? []).map(async (audit) => {
      if (!audit.record_id) return []
      if (audit.table_name === "programme" || audit.table_name === "requirement") {
        return [{ audit_id: audit.id, programme_id: audit.record_id }]
      }
      const table = CHILD_TABLES[audit.table_name]
      if (!table) return []
      const { data } = await db.from(table).select("programme_id").eq("id", audit.record_id).maybeSingle()
      return data ? [{ audit_id: audit.id, programme_id: data.programme_id }] : []
    })
  )

  const reminders = [...deadlineReminders(watched, now), ...changeReminders(watched, changes.flat())]
  let sent = 0
  for (const { subject, text, ...reminder } of reminders) {
    // Claim first: the unique key means a re-run or an overlapping run can't send it twice.
    const { data: claimed } = await db
      .from("reminder_log")
      .upsert(reminder, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true })
      .select("id")
    if (claimed?.length && (await sendEmail({ subject, text }))) {
      sent++
      await recordActivity("reminder_sent", {
        actor: { type: "system" },
        target: { type: "user", id: reminder.user_id },
        properties: { kind: reminder.dedupe_key.startsWith("change") ? "change" : "deadline" },
      })
    }
  }
  // Retention: activity older than 24 months goes (docs/SPEC_ACCESS_ADMIN.md, section 4).
  const { data: purged, error: purgeError } = await db.rpc("purge_activity_events")
  if (purgeError) console.error("activity purge failed:", purgeError.message)
  const summary = {
    due: reminders.length,
    sent,
    expired_reports: expiredReports ?? 0,
    purged_activity: purged ?? 0,
  }
  await logCronRun("reminders", started, true, summary)
  return NextResponse.json(summary)
}
