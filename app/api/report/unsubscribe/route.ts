import { NextResponse } from "next/server"

import { serviceClient } from "@/lib/db/service"
import { verifyReport } from "@/lib/report/links"
import { failureResponse } from "@/lib/server-errors"

/** Unsubscribe-and-delete: the report, its email address and its consents are removed at once. */
export async function POST(request: Request) {
  const origin = new URL(request.url).origin
  const form = await request.formData().catch(() => null)
  const id = String(form?.get("r") ?? "")
  const token = String(form?.get("t") ?? "")
  if (!verifyReport(id, "unsubscribe", token)) {
    return NextResponse.json({ error: "This link isn't valid" }, { status: 400 })
  }
  try {
    const { error } = await serviceClient().from("report").delete().eq("id", id)
    if (error) throw error
    return NextResponse.redirect(new URL("/report/unsubscribe?done=1", origin), 303)
  } catch (err) {
    return failureResponse(err)
  }
}
