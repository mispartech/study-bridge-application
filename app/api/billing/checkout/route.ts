import { randomUUID } from "node:crypto"

import { NextResponse } from "next/server"
import { z } from "zod"

import { supabaseServer } from "@/lib/auth/server"
import { PLUS, paystackKey, plusOnSale } from "@/lib/billing/paystack"
import { serviceClient } from "@/lib/db/service"

const initialised = z.object({ data: z.object({ authorization_url: z.url() }) })

/** Starts a Paystack test-mode checkout. Plus is only ever granted by the signed webhook. */
export async function POST(request: Request) {
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  const key = paystackKey()
  if (!key) return NextResponse.json({ error: "Payments aren't available yet" }, { status: 503 })

  const now = new Date()
  if (!plusOnSale(now)) return NextResponse.json({ error: "This cycle has ended" }, { status: 410 })
  const { data: subscription } = await supabase.from("subscription").select("plan, current_period_end").maybeSingle()
  const end = subscription?.current_period_end
  if (subscription?.plan === "plus" && (!end || new Date(end) > now)) {
    return NextResponse.json({ error: "You already have Plus" }, { status: 409 })
  }

  const reference = `sb_${randomUUID()}`
  const { error } = await serviceClient().from("payment").insert({
    user_id: user.id,
    reference,
    amount_minor: PLUS.amount_minor,
    currency: PLUS.currency,
  })
  if (error) return NextResponse.json({ error: "Could not start checkout" }, { status: 500 })

  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      email: user.email,
      amount: PLUS.amount_minor,
      currency: PLUS.currency,
      reference,
      callback_url: `${new URL(request.url).origin}/settings?paid=1`,
    }),
  })
  const parsed = initialised.safeParse(await res.json().catch(() => null))
  if (!res.ok || !parsed.success) return NextResponse.json({ error: "Could not start checkout" }, { status: 502 })
  return NextResponse.json({ url: parsed.data.data.authorization_url })
}
