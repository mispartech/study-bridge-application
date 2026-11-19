import { randomUUID } from "node:crypto"

import { NextResponse } from "next/server"
import { z } from "zod"

import { adminFromRequest } from "@/lib/auth/admin"
import { serviceClient } from "@/lib/db/service"
import { invalidateCatalogue } from "@/lib/match/catalogue"
import { failureResponse } from "@/lib/server-errors"

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024
const IMAGE_TYPES: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }

const fields = z
  .object({
    item: z.enum(["flights", "health_cover"]),
    country: z.enum(["UK", "CA"]),
    city: z.string().trim().min(2).max(60).optional(),
    region: z.string().trim().min(2).max(60).optional(),
    amount: z.coerce.number().positive().max(100_000_000),
    currency: z.enum(["NGN", "GBP", "CAD", "USD"]),
    per_year: z.literal("on").optional(),
    observed_on: z.iso.date(),
    source_url: z.url({ protocol: /^https$/ }),
  })
  .refine((f) => (f.item === "flights" ? Boolean(f.city) : Boolean(f.region)), {
    message: "Flights need a city, health cover a province",
  })

/** Flights by destination city, health cover by province. Labelled estimated, with a screenshot as evidence. */
export async function POST(request: Request) {
  const { denied } = await adminFromRequest()
  if (denied) return denied
  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: "Invalid form" }, { status: 400 })
  const parsed = fields.safeParse(
    Object.fromEntries([...form.entries()].filter(([key, value]) => key !== "evidence" && value !== ""))
  )
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the form" }, { status: 400 })
  }
  const evidence = form.get("evidence")
  const file = evidence instanceof File && evidence.size > 0 ? evidence : null
  const f = parsed.data
  if (f.item === "flights" && !file)
    return NextResponse.json({ error: "Add the screenshot of the quotes" }, { status: 400 })
  if (file && (!IMAGE_TYPES[file.type] || file.size > MAX_SCREENSHOT_BYTES)) {
    return NextResponse.json({ error: "The screenshot must be a PNG, JPEG or WebP under 5 MB" }, { status: 400 })
  }
  try {
    const db = serviceClient()
    let evidence_path: string | null = null
    if (file) {
      evidence_path = `${f.item}/${randomUUID()}.${IMAGE_TYPES[file.type]}`
      const { error } = await db.storage.from("evidence").upload(evidence_path, file, { contentType: file.type })
      if (error) throw error
    }
    const scope = { country: f.country, item: f.item, city: f.city ?? null, region: f.region ?? null }
    let remove = db
      .from("cost_estimate")
      .delete()
      .eq("is_demo", false)
      .eq("country", scope.country)
      .eq("item", scope.item)
    remove = scope.city ? remove.eq("city", scope.city) : remove.is("city", null)
    remove = scope.region ? remove.eq("region", scope.region) : remove.is("region", null)
    const { error: removeError } = await remove
    if (removeError) throw removeError
    const { error } = await db.from("cost_estimate").insert({
      ...scope,
      amount_minor: Math.round(f.amount * 100),
      currency: f.currency,
      per_year: f.per_year === "on",
      source_url: f.source_url,
      observed_on: f.observed_on,
      evidence_path,
      last_verified_at: new Date(`${f.observed_on}T12:00:00+01:00`).toISOString(),
      confidence: "estimated",
      is_demo: false,
    })
    if (error) throw error
    invalidateCatalogue()
    return NextResponse.json({ ok: true })
  } catch (err) {
    return failureResponse(err)
  }
}
