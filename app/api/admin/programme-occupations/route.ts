import { NextResponse } from "next/server"

import rawSchema from "@/schemas/r5_occupations.schema.json"
import { audit } from "@/lib/activity/audit"
import { linkAction, validSuggestions } from "@/lib/admin/careers"
import { generateStructured } from "@/lib/ai"
import { loadPrompt } from "@/lib/ai/prompts"
import { staffFromRequest } from "@/lib/auth/admin"
import { serviceClient } from "@/lib/db/service"
import { invalidateCatalogue } from "@/lib/match/catalogue"
import { fieldLabel } from "@/lib/match/labels"
import { failureResponse } from "@/lib/server-errors"

export const maxDuration = 60
const MAX_OFFERED = 300

/** Suggest, add, approve or reject links from a programme to occupations. Content staff; audited per link. */
export async function POST(request: Request) {
  const { user, denied } = await staffFromRequest("content")
  if (denied) return denied
  const parsed = linkAction.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Check the values and try again" }, { status: 400 })
  const input = parsed.data
  const db = serviceClient()
  try {
    if ("links" in input) {
      const status = input.action === "approve" ? "approved" : "rejected"
      let changed = 0
      for (const link of input.links) {
        const { data: before } = await db
          .from("programme_occupation")
          .select("*")
          .match(link)
          .neq("status", status)
          .maybeSingle()
        if (!before) continue
        const { error } = await db
          .from("programme_occupation")
          .update({ status, reviewed_by: user.id, reviewed_at: new Date().toISOString() })
          .match(link)
        if (error) continue
        changed += 1
        await audit(user, "career_link_reviewed", {
          targetType: "programme_occupation",
          targetId: link.programme_id,
          before,
          after: { ...link, status },
        })
      }
      invalidateCatalogue()
      return NextResponse.json({ ok: true, changed, unchanged: input.links.length - changed })
    }

    const { data: programme } = await db
      .from("programme")
      .select("id, title, field, description, university!inner(country)")
      .eq("id", input.programme_id)
      .eq("is_demo", false)
      .maybeSingle()
    if (!programme) return NextResponse.json({ error: "Programme not found" }, { status: 404 })
    const { data: occupations } = await db
      .from("occupation")
      .select("id, code, title")
      .eq("country", programme.university.country)
      .order("code")
      .limit(MAX_OFFERED)
    const offered = new Set((occupations ?? []).map((o) => o.id))

    if (input.action === "add") {
      const { data: occupation } = await db
        .from("occupation")
        .select("id")
        .eq("id", input.occupation_id)
        .eq("country", programme.university.country)
        .maybeSingle()
      if (!occupation) return NextResponse.json({ error: "That occupation is for another country" }, { status: 422 })
      const row = {
        programme_id: programme.id,
        occupation_id: occupation.id,
        status: "approved",
        suggested_by: "editor",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      }
      const { error } = await db.from("programme_occupation").upsert(row, { onConflict: "programme_id,occupation_id" })
      if (error) return NextResponse.json({ error: error.message }, { status: 422 })
      await audit(user, "career_link_reviewed", {
        targetType: "programme_occupation",
        targetId: programme.id,
        after: row,
      })
      invalidateCatalogue()
      return NextResponse.json({ ok: true, changed: 1 })
    }

    if (offered.size === 0) {
      return NextResponse.json({ error: "Add occupations for this country first" }, { status: 422 })
    }
    const prompt = await loadPrompt("r5_occupations", {
      title: programme.title,
      field: fieldLabel(programme.field),
      description: programme.description || "(none)",
      occupations: (occupations ?? []).map((o) => `${o.id} | ${o.code} | ${o.title}`).join("\n"),
    })
    const { data } = await generateStructured<{ suggestions: { occupation_id: string; rationale: string }[] }>(
      "occupations",
      prompt,
      rawSchema,
      { toolName: "suggest_occupations", userId: user.id, maxOutputTokens: 2000 }
    )
    const suggestions = validSuggestions(data.suggestions, offered)
    if (suggestions.length) {
      // Never overwrites a link an editor has already approved or rejected.
      const { error } = await db.from("programme_occupation").upsert(
        suggestions.map((s) => ({ ...s, programme_id: programme.id, status: "suggested", suggested_by: "ai" })),
        { onConflict: "programme_id,occupation_id", ignoreDuplicates: true }
      )
      if (error) return NextResponse.json({ error: error.message }, { status: 422 })
    }
    await audit(user, "career_data_changed", {
      targetType: "programme",
      targetId: programme.id,
      after: { suggested: suggestions.map((s) => s.occupation_id) },
    })
    return NextResponse.json({ ok: true, changed: suggestions.length })
  } catch (err) {
    return failureResponse(err)
  }
}
