import { cookies } from "next/headers"
import { NextResponse } from "next/server"
import { z } from "zod"

import { rowToProfile } from "@/lib/account/profile-row"
import { addToShortlist } from "@/lib/account/shortlist-server"
import { logGuardTrigger } from "@/lib/advisor/guard-log"
import { advisorTurn } from "@/lib/advisor/run"
import type { AdvisorContext } from "@/lib/advisor/tools"
import { consumeAdvisorMessage, refundAdvisorMessage } from "@/lib/ai/advisor-quota"
import { supabaseServer } from "@/lib/auth/server"
import { parseProfileCookie } from "@/lib/match/draft"
import { demoModeEnabled, loadCatalogue } from "@/lib/match/catalogue"
import { PROFILE_COOKIE } from "@/lib/match/profile-store"
import { clientIp, LIMITS } from "@/lib/security/limits"
import { clientFrom, hitBoth, refundBoth, withDeviceCookie } from "@/lib/security/rate-limit"
import { verifyTurnstile } from "@/lib/security/turnstile"

const MAX_MESSAGE_CHARS = 2000
const MAX_HISTORY = 12
const ANONYMOUS_LIMIT = LIMITS.advisorAnonymous.device.limit

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
  turnstile_token: z.string().max(2048).optional(),
})

type Turn = {
  ctx: AdvisorContext
  shortlist: { id: string; title: string }[]
  userId: string | null
  quota: { used: number; limit: number | null; anonymous: boolean }
  refund: () => Promise<number>
}

/**
 * One advisor turn, streamed as NDJSON. Signed-in students use their account quota. Anonymous visitors get
 * 2 messages a day per device, behind a bot check, using the profile kept in their browser.
 */
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
  const now = new Date()
  const demoMode = demoModeEnabled()

  let turn: Turn
  const client = clientFrom(request)
  if (user) {
    const { data: row } = await supabase.from("student_profile").select("*").maybeSingle()
    if (!row?.consent_given_at) return NextResponse.json({ error: "Consent needed" }, { status: 403 })
    // The user id comes from the verified session, never the request, and the count happens in the database.
    const quota = await consumeAdvisorMessage(user.id)
    if (!quota.allowed) {
      return NextResponse.json({ error: "Daily limit reached", used: quota.used, limit: quota.limit }, { status: 429 })
    }
    const catalogue = await loadCatalogue(demoMode)
    const { data: saved } = await supabase.from("shortlist").select("programme_id")
    const ids = (saved ?? []).map((s) => s.programme_id)
    turn = {
      ctx: {
        profile: rowToProfile(row, now),
        catalogue,
        options: { now, demoMode },
        addToShortlist: (programmeId: string) => addToShortlist(supabase, programmeId),
      },
      shortlist: catalogue.programmes.filter((p) => ids.includes(p.id)).map((p) => ({ id: p.id, title: p.title })),
      userId: user.id,
      quota: { used: quota.used, limit: quota.limit, anonymous: false },
      refund: () => refundAdvisorMessage(user.id),
    }
  } else {
    const profile = parseProfileCookie((await cookies()).get(PROFILE_COOKIE)?.value)
    if (!profile) return NextResponse.json({ error: "Profile needed" }, { status: 409 })
    if (!(await verifyTurnstile(parsed.data.turnstile_token, clientIp(request.headers)))) {
      return NextResponse.json({ error: "Security check failed. Refresh and try again." }, { status: 403 })
    }
    const limit = await hitBoth(LIMITS.advisorAnonymous, client)
    if (!limit.allowed) {
      const res = NextResponse.json(
        { error: "Daily limit reached", used: ANONYMOUS_LIMIT, limit: ANONYMOUS_LIMIT, anonymous: true },
        { status: 429 }
      )
      return withDeviceCookie(res, client)
    }
    turn = {
      ctx: {
        profile,
        catalogue: await loadCatalogue(demoMode),
        options: { now, demoMode },
        addToShortlist: async () => "sign_in_required",
      },
      shortlist: [],
      userId: null,
      quota: { used: limit.deviceHits, limit: ANONYMOUS_LIMIT, anonymous: true },
      refund: () => refundBoth(LIMITS.advisorAnonymous, client),
    }
  }
  return withDeviceCookie(stream(parsed.data.messages, turn), client)
}

function stream(messages: z.infer<typeof body>["messages"], { ctx, shortlist, userId, quota, refund }: Turn) {
  const encoder = new TextEncoder()
  let open = true // False once the student leaves mid-answer.
  const send = (controller: ReadableStreamDefaultController<Uint8Array>, event: unknown) => {
    if (open) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
  }
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      send(controller, { type: "quota", ...quota })
      let failed = false
      try {
        const turn = advisorTurn(messages, ctx, shortlist, {
          userId: userId ?? undefined,
          onGuard: (trigger) => logGuardTrigger(userId, trigger),
        })
        for await (const event of turn) {
          if (event.type === "tool") {
            const { name, programmes, sources } = event
            send(controller, { type: "tool", name, programmes, sources })
          } else if (event.type === "error") {
            console.error("Advisor failed:", event.message)
            failed = true
            send(controller, { type: "error" })
          } else {
            send(controller, event)
          }
        }
      } catch (err) {
        console.error("Advisor failed:", err instanceof Error ? err.message : err)
        failed = true
        send(controller, { type: "error" })
      }
      // A failed model call doesn't use up one of the student's messages.
      if (failed) {
        const used = await refund().catch(() => quota.used)
        send(controller, { type: "quota", ...quota, used })
      }
      if (open) controller.close()
    },
    cancel() {
      open = false
    },
  })
  return new Response(body, { headers: { "content-type": "application/x-ndjson" } })
}
