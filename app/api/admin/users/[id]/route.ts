import { NextResponse } from "next/server"
import { z } from "zod"

import { adminFromRequest } from "@/lib/auth/admin"
import { serviceClient } from "@/lib/db/service"
import { failureResponse } from "@/lib/server-errors"

const body = z.object({ action: z.enum(["grant_admin", "revoke_admin"]) })

/** Grants or removes admin. An admin can't remove their own access, so the console is never left without one. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, denied } = await adminFromRequest()
  if (denied) return denied
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  const { id } = await params
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (id === user.id && parsed.data.action === "revoke_admin") {
    return NextResponse.json({ error: "You can't remove your own admin access" }, { status: 422 })
  }
  try {
    const db = serviceClient()
    const { data, error: getError } = await db.auth.admin.getUserById(id)
    if (getError || !data.user) return NextResponse.json({ error: "Not found" }, { status: 404 })
    // Supabase merges app_metadata, so only the role changes.
    const role = parsed.data.action === "grant_admin" ? "admin" : null
    const { error } = await db.auth.admin.updateUserById(id, { app_metadata: { role } })
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    return failureResponse(err)
  }
}
