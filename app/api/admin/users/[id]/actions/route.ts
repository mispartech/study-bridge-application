import { NextResponse } from "next/server"
import { z } from "zod"

import { eraseAccount } from "@/lib/account/erase"
import { audit } from "@/lib/activity/audit"
import { staffFromRequest } from "@/lib/auth/admin"
import { serviceClient } from "@/lib/db/service"
import { sendEmail } from "@/lib/email/send"
import { failureResponse } from "@/lib/server-errors"

const SUSPEND_FOR = "876000h" // 100 years: until someone lifts it

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("suspend"), reason: z.string().trim().min(3).max(300) }),
  z.object({ action: z.literal("unsuspend") }),
  z.object({ action: z.literal("resend_link") }),
  z.object({ action: z.literal("delete"), reason: z.string().trim().min(3).max(300), confirm: z.literal("DELETE") }),
])

/**
 * Account actions. Suspending and resending a link are support's job; deleting needs an admin, a reason
 * and typing DELETE. Nobody can act on their own account here. Every action goes in the audit log.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Check the form and try again" }, { status: 400 })
  const action = parsed.data
  const { user: staff, denied } = await staffFromRequest(action.action === "delete" ? "users.erase" : "users.manage")
  if (denied) return denied
  const { id } = await params
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (id === staff.id) return NextResponse.json({ error: "You can't do that to your own account" }, { status: 422 })
  try {
    const db = serviceClient()
    const { data, error: getError } = await db.auth.admin.getUserById(id)
    const target = data?.user
    if (getError || !target) return NextResponse.json({ error: "Not found" }, { status: 404 })

    if (action.action === "suspend" || action.action === "unsuspend") {
      const { error } = await db.auth.admin.updateUserById(id, {
        ban_duration: action.action === "suspend" ? SUSPEND_FOR : "none",
      })
      if (error) throw error
      await audit(staff, action.action === "suspend" ? "user_suspended" : "user_unsuspended", {
        targetType: "user",
        targetId: id,
        reason: action.action === "suspend" ? action.reason : undefined,
      })
      return NextResponse.json({ ok: true })
    }

    if (action.action === "resend_link") {
      if (!target.email) return NextResponse.json({ error: "This account has no email" }, { status: 422 })
      const { data: link, error } = await db.auth.admin.generateLink({ type: "magiclink", email: target.email })
      if (error) throw error
      const origin = new URL(request.url).origin
      const url = `${origin}/auth/callback?token_hash=${link.properties.hashed_token}&type=${link.properties.verification_type}&next=/discover`
      const sent = await sendEmail({
        to: target.email,
        subject: "Your StudyBridge sign-in link",
        text: `Here's a link to sign in to StudyBridge. It works once and expires soon.\n\n${url}\n\nIf you didn't ask for this, you can ignore it.`,
      })
      if (!sent) return NextResponse.json({ error: "The email didn't send. Try again." }, { status: 502 })
      await audit(staff, "link_resent", { targetType: "user", targetId: id })
      return NextResponse.json({ ok: true })
    }

    await eraseAccount(target)
    await audit(staff, "user_deleted", {
      targetType: "user",
      targetId: id,
      before: { email: target.email, created_at: target.created_at },
      reason: action.reason,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return failureResponse(err)
  }
}
