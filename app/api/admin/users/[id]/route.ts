import { NextResponse } from "next/server"
import { roleOf } from "@/lib/auth/roles"
import { audit } from "@/lib/activity/audit"
import { z } from "zod"

import { staffFromRequest } from "@/lib/auth/admin"
import { STAFF_ROLES } from "@/lib/auth/roles"
import { serviceClient } from "@/lib/db/service"
import { failureResponse } from "@/lib/server-errors"

const body = z.object({ role: z.enum(["student", ...STAFF_ROLES]) })

/** Changes someone's role (admins only). An admin can't change their own, so the console always keeps one. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user, denied } = await staffFromRequest("roles")
  if (denied) return denied
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  const { id } = await params
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (id === user.id) return NextResponse.json({ error: "You can't change your own role" }, { status: 422 })
  try {
    const db = serviceClient()
    const { data, error: getError } = await db.auth.admin.getUserById(id)
    if (getError || !data.user) return NextResponse.json({ error: "Not found" }, { status: 404 })
    // Supabase merges app_metadata, so only the role changes. Students have no role at all.
    const role = parsed.data.role === "student" ? null : parsed.data.role
    const { error } = await db.auth.admin.updateUserById(id, { app_metadata: { role } })
    if (error) throw error
    await audit(user, "role_changed", {
      targetType: "user",
      targetId: id,
      before: { role: roleOf(data.user) ?? "student" },
      after: { role: parsed.data.role },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return failureResponse(err)
  }
}
