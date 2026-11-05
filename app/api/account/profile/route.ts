import { NextResponse } from "next/server"
import { z } from "zod"

import { supabaseServer } from "@/lib/auth/server"
import { matchProfile } from "@/lib/match/types"

const patch = z
  .object({
    budget_total_minor: z.number().int().nonnegative().nullable(),
    include_related_fields: z.boolean(),
    weights: z.object({
      A: z.number().min(0),
      B: z.number().min(0),
      C: z.number().min(0),
      L: z.number().min(0),
      S: z.number().min(0),
      O: z.number().min(0),
    }),
  })
  .partial()

/** The wizard's saved answers, so it can reopen on any device. */
export async function GET() {
  const supabase = await supabaseServer()
  const { data } = await supabase.from("student_profile").select("wizard_answers").maybeSingle()
  const answers = data?.wizard_answers as Record<string, unknown> | undefined
  return NextResponse.json({ draft: answers && Object.keys(answers).length > 0 ? answers : null })
}

/** Results page changes: budget, weights and the related-fields toggle. */
export async function PATCH(request: Request) {
  const parsed = patch.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  if (parsed.data.weights) {
    const check = matchProfile.safeParse({ target_cycle: "2027/28", weights: parsed.data.weights })
    if (!check.success) return NextResponse.json({ error: "Weights must sum to 100" }, { status: 400 })
  }
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  const { error } = await supabase.from("student_profile").update(parsed.data).eq("user_id", user.id)
  if (error) return NextResponse.json({ error: "Could not save" }, { status: 500 })
  return NextResponse.json({ ok: true })
}
