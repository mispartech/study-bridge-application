// Makes an existing account an admin: npm run admin:grant -- person@example.com
// The role lives in app_metadata, which only the service key can change.
import { createClient } from "@supabase/supabase-js"

const email = process.argv[2]?.toLowerCase()
if (!email) throw new Error("Usage: npm run admin:grant -- person@example.com")

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})
const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 })
if (error) throw error
const user = data.users.find((u) => u.email?.toLowerCase() === email)
if (!user) throw new Error("No account with that email. Sign in once first, then run this again.")
const { error: updateError } = await db.auth.admin.updateUserById(user.id, {
  app_metadata: { ...user.app_metadata, role: "admin" },
})
if (updateError) throw updateError
console.log("Admin role granted. Sign out and in again for it to take effect.")
