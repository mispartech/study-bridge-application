import { NextResponse } from "next/server"
import { z } from "zod"

import { addToShortlist } from "@/lib/account/shortlist-server"
import { supabaseServer } from "@/lib/auth/server"

const body = z.object({ programme_id: z.uuid() })

async function session(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null))
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { parsed, supabase, user }
}

export async function POST(request: Request) {
  const { parsed, supabase, user } = await session(request)
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  const result = await addToShortlist(supabase, parsed.data.programme_id)
  if (result === "limit") return NextResponse.json({ error: "Your shortlist is full" }, { status: 409 })
  if (result !== "added") return NextResponse.json({ error: "Could not save" }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const { parsed, supabase, user } = await session(request)
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 })
  await supabase.from("shortlist").delete().eq("programme_id", parsed.data.programme_id)
  return NextResponse.json({ ok: true })
}
