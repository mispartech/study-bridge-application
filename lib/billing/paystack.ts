import { createHmac, timingSafeEqual } from "node:crypto"

import { z } from "zod"

import billing from "@/config/billing.json"

export const PLUS = billing.plus

/** Test mode only for now: a live key is refused, so no real card can be charged. */
export function paystackKey(env: Record<string, string | undefined> = process.env) {
  const key = env.PAYSTACK_SECRET_KEY
  return key?.startsWith("sk_test_") ? key : null
}

/** Paystack signs the raw body with HMAC SHA-512, using the secret key. */
export function validSignature(rawBody: string, signature: string | null, key: string) {
  if (!signature) return false
  const expected = Buffer.from(createHmac("sha512", key).update(rawBody).digest("hex"))
  const given = Buffer.from(signature)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

export const webhookEvent = z.object({
  event: z.string(),
  data: z.object({ reference: z.string(), amount: z.number().int(), currency: z.string(), status: z.string() }),
})

/** The payment a charge settles, only if it matches what we asked for. Metadata is never trusted. */
export const settles = (
  payment: { amount_minor: number; currency: string; status: string },
  data: z.infer<typeof webhookEvent>["data"]
) =>
  payment.status === "pending" &&
  data.status === "success" &&
  data.amount === payment.amount_minor &&
  data.currency === payment.currency

/** One payment covers the whole cycle, up to the end of the last day in Lagos. */
export const PLUS_ENDS = new Date(`${PLUS.valid_until}T23:59:59+01:00`)

export const plusOnSale = (now: Date) => now < PLUS_ENDS
