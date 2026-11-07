import { NextResponse } from "next/server"
import { z } from "zod"

import { adminFromRequest } from "@/lib/auth/admin"
import { serviceClient } from "@/lib/db/service"
import { failureResponse } from "@/lib/server-errors"

const body = z.object({ status: z.enum(["resolved", "dismissed"]) })

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await adminFromRequest()
  if (denied) return denied
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  const { id } = await params
  try {
    const { error } = await serviceClient().from("error_report").update(parsed.data).eq("id", id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    return failureResponse(err)
  }
}
