import { NextResponse } from "next/server"
import { z } from "zod"

import { approveItem } from "@/lib/admin/approve"
import { adminFromRequest } from "@/lib/auth/admin"
import { serviceClient } from "@/lib/db/service"
import { invalidateCatalogue } from "@/lib/match/catalogue"
import { failureResponse } from "@/lib/server-errors"

const body = z.object({ action: z.enum(["approve", "reject"]), record: z.json() })

/** Approving publishes the reviewed record in one transaction. Rejecting publishes nothing. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, denied } = await adminFromRequest()
  if (denied) return denied
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  const { id } = await params
  const { action, record } = parsed.data
  try {
    const db = serviceClient()
    if (action === "reject") {
      const { error } = await db
        .from("review_queue")
        .update({ status: "rejected", reviewed_by: user.id, reviewed_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", "pending")
      if (error) throw error
      return NextResponse.json({ ok: true })
    }
    const { data: item } = await db.from("review_queue").select("id, proposed, table_name").eq("id", id).maybeSingle()
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 })
    const result = await approveItem(item, user.id, record)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 })
    invalidateCatalogue()
    return NextResponse.json(result)
  } catch (err) {
    return failureResponse(err)
  }
}
