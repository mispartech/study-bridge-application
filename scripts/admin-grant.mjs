// Gives an existing account a staff role. The first admin is made this way, never through the app:
//   npm run admin:grant -- person@example.com            (admin)
//   npm run admin:grant -- person@example.com support    (support | data_editor | admin | student)
// The role lives in app_metadata, which only the service key can change. Staff must also set up
// two-factor sign-in (they are asked to at /staff/verify on their first visit to /admin).
import { createClient } from "@supabase/supabase-js"

const ROLES = ["support", "data_editor", "admin", "student"]
const email = process.argv[2]?.toLowerCase()
const role = process.argv[3] ?? "admin"
if (!email || !ROLES.includes(role)) {
  throw new Error(`Usage: npm run admin:grant -- person@example.com [${ROLES.join(" | ")}]`)
}

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 })
if (error) throw error
const user = data.users.find((u) => u.email?.toLowerCase() === email)
if (!user) throw new Error("No account with that email. Sign in once first, then run this again.")
const { error: updateError } = await db.auth.admin.updateUserById(user.id, {
  app_metadata: { ...user.app_metadata, role: role === "student" ? null : role },
})
if (updateError) throw updateError
console.log(`Role set to ${role}. Sign out and in again; staff then set up two-factor at /staff/verify.`)
