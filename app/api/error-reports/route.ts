import { NextResponse } from "next/server"
import { z } from "zod"

import { supabaseServer } from "@/lib/auth/server"
import { serviceClient } from "@/lib/db/service"
import { failureResponse } from "@/lib/server-errors"

const HOUR_MS = 3_600_000
const MAX_PER_PROGRAMME_PER_HOUR = 20

const body = z.object({ programme_id: z.uuid(), message: z.string().trim().min(5).max(1000) })

/** Anyone can report an error, so reports per programme are capped to keep a flood out of the queue. */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Please describe the problem in at least 5 characters" }, { status: 400 })
  }
  try {
    const supabase = await supabaseServer()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    const db = serviceClient()
    const since = new Date(Date.now() - HOUR_MS).toISOString()
    const { count } = await db
      .from("error_report")
      .select("id", { count: "exact", head: true })
      .eq("programme_id", parsed.data.programme_id)
      .gte("created_at", since)
    if ((count ?? 0) >= MAX_PER_PROGRAMME_PER_HOUR) {
      return NextResponse.json({ error: "Thanks, we've had several reports on this already" }, { status: 429 })
    }
    const { error } = await db.from("error_report").insert({ ...parsed.data, user_id: user?.id ?? null })
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    return failureResponse(err)
  }
}
