import { NextResponse } from "next/server"
import { z } from "zod"

import { audit } from "@/lib/activity/audit"
import { staffFromRequest } from "@/lib/auth/admin"
import { paystackKey } from "@/lib/billing/paystack"
import { serviceClient } from "@/lib/db/service"
import { failureResponse } from "@/lib/server-errors"

const body = z.object({ reason: z.string().trim().min(3).max(300) })

/**
 * Refunds a paid Plus purchase through Paystack (admins only, with a reason, audited). Uses the same
 * test-mode-only key as checkout. A refund ends the student's Plus straight away.
 */
export async function POST(request: Request, { params }: { params: Promise<{ reference: string }> }) {
  const { user, denied } = await staffFromRequest("payments")
  if (denied) return denied
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Give a reason for the refund" }, { status: 400 })
  const { reference } = await params
  const key = paystackKey()
  if (!key) return NextResponse.json({ error: "Paystack isn't set up (test key needed)" }, { status: 503 })
  try {
    const db = serviceClient()
    const { data: payment } = await db
      .from("payment")
      .select("reference, user_id, amount_minor, currency, status")
      .eq("reference", reference)
      .maybeSingle()
    if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (payment.status !== "paid")
      return NextResponse.json({ error: "Only a paid payment can be refunded" }, { status: 422 })

    const res = await fetch("https://api.paystack.co/refund", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ transaction: reference }),
      signal: AbortSignal.timeout(15_000),
    })
    const result = (await res.json().catch(() => null)) as { status?: boolean; message?: string } | null
    if (!res.ok || !result?.status) {
      return NextResponse.json({ error: `Paystack refused: ${result?.message ?? res.status}` }, { status: 502 })
    }
    const now = new Date().toISOString()
    const { error } = await db
      .from("payment")
      .update({ status: "refunded", refunded_at: now })
      .eq("reference", reference)
      .eq("status", "paid")
    if (error) throw error
    if (payment.user_id) {
      await db.from("subscription").update({ plan: "free", current_period_end: now }).eq("user_id", payment.user_id)
    }
    await audit(user, "refund_issued", {
      targetType: "payment",
      targetId: reference,
      before: { status: "paid" },
      after: { status: "refunded", amount_minor: payment.amount_minor, currency: payment.currency },
      reason: parsed.data.reason,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return failureResponse(err)
  }
}
