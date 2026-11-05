import { NextResponse } from "next/server"
import { z } from "zod"

import { supabaseServer } from "@/lib/auth/server"
import { serviceClient } from "@/lib/db/service"

const confirmation = z.object({ confirm: z.literal("DELETE") })

/** Everything we hold on the student, as a download. Read through RLS, so only ever their own. */
export async function GET() {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  const [profile, shortlist, tracker, subscription, payments] = await Promise.all([
    supabase.from("student_profile").select("*").maybeSingle(),
    supabase.from("shortlist").select("*"),
    supabase.from("application_tracker").select("*"),
    supabase.from("subscription").select("*").maybeSingle(),
    supabase.from("payment").select("*"),
  ])
  const body = {
    exported_at: new Date().toISOString(),
    email: user.email,
    profile: profile.data,
    shortlist: shortlist.data,
    application_tracker: tracker.data,
    subscription: subscription.data,
    payments: payments.data,
  }
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": 'attachment; filename="studybridge-data.json"',
    },
  })
}

/** Deletes the account. Student data goes with it; payment records stay, with no name attached. */
export async function DELETE(request: Request) {
  if (!confirmation.safeParse(await request.json().catch(() => null)).success) {
    return NextResponse.json({ error: "Confirmation needed" }, { status: 400 })
  }
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  const { error } = await serviceClient().auth.admin.deleteUser(user.id)
  if (error) return NextResponse.json({ error: "Could not delete" }, { status: 500 })
  await supabase.auth.signOut()
  return NextResponse.json({ ok: true })
}
