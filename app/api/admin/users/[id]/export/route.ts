import { NextResponse } from "next/server"
import { z } from "zod"

import { collectUserData } from "@/lib/account/erase"
import { audit } from "@/lib/activity/audit"
import { staffFromRequest } from "@/lib/auth/admin"
import { failureResponse } from "@/lib/server-errors"

/** Everything held about one person, as JSON (an NDPA access request). Admins only, and audited. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { user: staff, denied } = await staffFromRequest("users.erase")
  if (denied) return denied
  const { id } = await params
  if (!z.uuid().safeParse(id).success) return NextResponse.json({ error: "Not found" }, { status: 404 })
  try {
    const data = await collectUserData(id)
    if (!data.account) return NextResponse.json({ error: "Not found" }, { status: 404 })
    await audit(staff, "export_downloaded", { targetType: "user", targetId: id, after: { kind: "user_data" } })
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="studybridge-user-${id.slice(0, 8)}.json"`,
        "cache-control": "no-store",
      },
    })
  } catch (err) {
    return failureResponse(err)
  }
}
