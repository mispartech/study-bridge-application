import { NextResponse } from "next/server"
import { z } from "zod"

import { rowToProfile } from "@/lib/account/profile-row"
import { addToShortlist } from "@/lib/account/shortlist-server"
import { advisorTurn } from "@/lib/advisor/run"
import { consumeAdvisorMessage } from "@/lib/ai/advisor-quota"
import { supabaseServer } from "@/lib/auth/server"
import { demoModeEnabled, loadCatalogue } from "@/lib/match/catalogue"

const MAX_MESSAGE_CHARS = 2000
const MAX_HISTORY = 12

const body = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z
          .string()
          .min(1)
          .max(MAX_MESSAGE_CHARS * 4),
      })
    )
    .min(1)
    .max(MAX_HISTORY),
})

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null))
  const latest = parsed.data?.messages.at(-1)
  if (!parsed.success || latest?.role !== "user" || latest.content.length > MAX_MESSAGE_CHARS) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 })
  }
  const supabase = await supabaseServer()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 })

  const { data: row } = await supabase.from("student_profile").select("*").maybeSingle()
  if (!row?.consent_given_at) return NextResponse.json({ error: "Consent needed" }, { status: 403 })

  // The user id comes from the verified session, never the request, and the count happens in the database.
  const quota = await consumeAdvisorMessage(user.id)
  if (!quota.allowed) {
    return NextResponse.json({ error: "Daily limit reached", used: quota.used, limit: quota.limit }, { status: 429 })
  }

  const now = new Date()
  const demoMode = demoModeEnabled()
  const catalogue = await loadCatalogue(demoMode)
  const { data: saved } = await supabase.from("shortlist").select("programme_id")
  const ids = (saved ?? []).map((s) => s.programme_id)
  const shortlist = catalogue.programmes.filter((p) => ids.includes(p.id)).map((p) => ({ id: p.id, title: p.title }))
  const ctx = {
    profile: rowToProfile(row, now),
    catalogue,
    options: { now, demoMode },
    addToShortlist: (programmeId: string) => addToShortlist(supabase, programmeId),
  }

  const encoder = new TextEncoder()
  let open = true // False once the student leaves mid-answer.
  const send = (controller: ReadableStreamDefaultController<Uint8Array>, event: unknown) => {
    if (open) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      send(controller, { type: "quota", used: quota.used, limit: quota.limit })
      try {
        for await (const event of advisorTurn(parsed.data.messages, ctx, shortlist, user.id)) {
          if (event.type === "tool") {
            const { name, programmes, sources } = event
            send(controller, { type: "tool", name, programmes, sources })
          } else if (event.type === "error") {
            console.error("Advisor failed:", event.message)
            send(controller, { type: "error" })
          } else {
            send(controller, event)
          }
        }
      } catch (err) {
        console.error("Advisor failed:", err instanceof Error ? err.message : err)
        send(controller, { type: "error" })
      }
      if (open) controller.close()
    },
    cancel() {
      open = false
    },
  })
  return new Response(stream, { headers: { "content-type": "application/x-ndjson" } })
}
