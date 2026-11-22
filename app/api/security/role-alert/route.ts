import { NextResponse } from "next/server"
import { z } from "zod"

import { sendQueuedRoleAlert } from "@/lib/security/role-alert"

const body = z.object({ id: z.number().int().positive() })

/**
 * Called by the database the moment a staff role changes. It carries only the queue id: the alert itself is
 * read back with the service key and claimed once, so this needs no secret and can't be used to send anything
 * that wasn't queued.
 */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  const sent = await sendQueuedRoleAlert({ id: parsed.data.id })
  return NextResponse.json({ ok: true, sent })
}
