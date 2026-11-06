import { NextResponse } from "next/server"

import { captureServer } from "@/lib/analytics/server"
import { paystackKey, PLUS_ENDS, settles, validSignature, webhookEvent } from "@/lib/billing/paystack"
import { serviceClient } from "@/lib/db/service"

/** Grants Plus. Everything here is checked: the signature, then the amount against our own record. */
export async function POST(request: Request) {
  const key = paystackKey()
  if (!key) return NextResponse.json({ error: "Not configured" }, { status: 503 })
  const raw = await request.text()
  if (!validSignature(raw, request.headers.get("x-paystack-signature"), key)) {
    return NextResponse.json({ error: "Bad signature" }, { status: 401 })
  }
  const parsed = webhookEvent.safeParse(JSON.parse(raw))
  // Paystack retries anything but a 200, so events we don't act on are acknowledged.
  if (!parsed.success || parsed.data.event !== "charge.success") return NextResponse.json({ ok: true })

  const { data } = parsed.data
  const db = serviceClient()
  const { data: payment } = await db.from("payment").select("*").eq("reference", data.reference).maybeSingle()
  if (!payment || !settles(payment, data)) return NextResponse.json({ ok: true })

  const now = new Date()
  // The status check makes a repeated webhook a no-op, even if two arrive together.
  const { data: claimed } = await db
    .from("payment")
    .update({ status: "paid", paid_at: now.toISOString() })
    .eq("id", payment.id)
    .eq("status", "pending")
    .select("user_id")
    .maybeSingle()
  if (!claimed?.user_id) return NextResponse.json({ ok: true })

  const { error } = await db.from("subscription").upsert({
    user_id: claimed.user_id,
    plan: "plus",
    current_period_end: PLUS_ENDS.toISOString(),
  })
  if (error) return NextResponse.json({ error: "Could not update plan" }, { status: 500 })
  const { data: student } = await db
    .from("student_profile")
    .select("consent_given_at")
    .eq("user_id", claimed.user_id)
    .maybeSingle()
  if (student?.consent_given_at) await captureServer("plus_paid", claimed.user_id)
  return NextResponse.json({ ok: true })
}
