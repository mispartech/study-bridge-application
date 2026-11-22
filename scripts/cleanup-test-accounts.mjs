// Removes staff roles from everyone but the keepers, and deletes test accounts (e2e-, sentry-check, any
// @example.com) with their data. Every action is written to staff_audit as a system cleanup.
//
//   node --env-file=.env.local scripts/cleanup-test-accounts.mjs --keep owner@domain            dry run
//   node --env-file=.env.local scripts/cleanup-test-accounts.mjs --keep owner@domain --confirm  does it
// --keep (repeatable) names the staff accounts that keep their role. No addresses live in this file.
//   ... --tests-only --confirm   after a test run: deletes test accounts and test reports, touches no roles
//
// Prints emails only, never keys or tokens.
import { createClient } from "@supabase/supabase-js"

const KEEP_STAFF = new Set(process.argv.flatMap((arg, i, all) => (all[i - 1] === "--keep" ? [arg.toLowerCase()] : [])))
const testsOnly = process.argv.includes("--tests-only")
if (!testsOnly && KEEP_STAFF.size === 0) throw new Error("Name the staff to keep: --keep owner@domain")
const SYSTEM_ID = "00000000-0000-0000-0000-000000000000"
const REASON = "System cleanup: test accounts must not exist in production"
const confirm = process.argv.includes("--confirm")
const isTest = (email = "") => /^(e2e-|sentry-check)/i.test(email) || /@example\.com$/i.test(email)

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

async function allUsers() {
  const users = []
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    users.push(...data.users)
    if (data.users.length < 1000) return users
  }
}

async function audit(action, user, before, after) {
  const { error } = await db.from("staff_audit").insert({
    staff_id: SYSTEM_ID,
    staff_email: "system",
    action,
    target_type: "user",
    target_id: user.id,
    before,
    after,
    reason: REASON,
  })
  if (error) throw error
}

const must = (res, what) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`)
  return res
}

const users = await allUsers()
const demote = testsOnly
  ? []
  : users.filter((u) => u.app_metadata?.role && !KEEP_STAFF.has((u.email ?? "").toLowerCase()))
const remove = users.filter((u) => isTest(u.email ?? ""))

console.log(confirm ? "CLEANUP" : "DRY RUN (add --confirm to act)")
console.log(`\nStaff role removed (${demote.length}):`)
for (const u of demote) console.log(`  ${u.email}  role ${u.app_metadata.role} -> none`)
console.log(`\nTest accounts deleted (${remove.length}):`)
for (const u of remove) console.log(`  ${u.email}  created ${u.created_at.slice(0, 10)}`)
if (!confirm) {
  console.log("\nNothing changed.")
} else {
  for (const u of demote) {
    const before = { role: u.app_metadata.role }
    const { role: _role, ...rest } = u.app_metadata
    must(await db.auth.admin.updateUserById(u.id, { app_metadata: { ...rest, role: null } }), `demote ${u.email}`)
    await audit("system_cleanup_role_removed", u, before, { role: null })
  }

  const totals = { reports: 0, ai_usage: 0, payments: 0, activity: 0, accounts: 0 }
  for (const u of remove) {
    const email = (u.email ?? "").toLowerCase()
    const reports = must(
      await db.from("report").delete().or(`claimed_user_id.eq.${u.id},email.eq."${email}"`).select("id"),
      `reports of ${email}`
    )
    const usage = must(await db.from("ai_usage").delete().eq("user_id", u.id).select("id"), `ai_usage of ${email}`)
    const payments = must(await db.from("payment").delete().eq("user_id", u.id).select("id"), `payments of ${email}`)
    const activity = must(await db.rpc("purge_test_activity", { p_actor_ids: [u.id] }), `activity of ${email}`)
    // Profile, shortlist, tracker, search log, subscription, advisor counts and guard logs go with the account.
    must(await db.auth.admin.deleteUser(u.id), `delete ${email}`)
    const removed = {
      reports: reports.data.length,
      ai_usage: usage.data.length,
      payments: payments.data.length,
      activity: activity.data ?? 0,
    }
    await audit("system_cleanup_account_deleted", u, { email, role: u.app_metadata?.role ?? null }, removed)
    for (const [k, v] of Object.entries(removed)) totals[k] += v
    totals.accounts += 1
    console.log(`  deleted ${email}: ${JSON.stringify(removed)}`)
  }
  // Reports emailed to test addresses that never became accounts.
  const stray = must(await db.from("report").delete().like("email", "%@example.com").select("id"), "test reports")
  totals.reports += stray.data.length
  console.log("\nTotals:", JSON.stringify(totals))
}
