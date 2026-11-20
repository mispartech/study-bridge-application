import { NextResponse } from "next/server"
import { audit } from "@/lib/activity/audit"
import { z } from "zod"

import { PROVIDER_KEY_ENV } from "@/lib/ai/config"
import { staffFromRequest } from "@/lib/auth/admin"
import { getSettings, saveSetting, settingsSchema } from "@/lib/settings"
import { failureResponse } from "@/lib/server-errors"

const body = z.discriminatedUnion("key", [
  z.object({ key: z.literal("ai_models"), value: settingsSchema.shape.ai_models }),
  z.object({ key: z.literal("model_prices"), value: settingsSchema.shape.model_prices }),
  z.object({ key: z.literal("advisor_free_limit"), value: settingsSchema.shape.advisor_free_limit }),
])

/** Saves one admin setting. A model can only be chosen when its provider's key is set on the server. */
export async function POST(request: Request) {
  const { user, denied } = await staffFromRequest("settings")
  if (denied) return denied
  const parsed = body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Check the values and try again" }, { status: 400 })
  if (parsed.data.key === "ai_models") {
    const missing = Object.values(parsed.data.value)
      .map((ref) => PROVIDER_KEY_ENV[ref.provider])
      .filter((name) => !process.env[name])
    if (missing.length) {
      return NextResponse.json(
        { error: `Set ${[...new Set(missing)].join(", ")} on the server first` },
        { status: 422 }
      )
    }
  }
  try {
    // Narrowed by the discriminated union above.
    const before = (await getSettings())[parsed.data.key]
    await saveSetting(parsed.data.key, parsed.data.value as never, user.id)
    await audit(user, "setting_changed", {
      targetType: "setting",
      targetId: parsed.data.key,
      before,
      after: parsed.data.value,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return failureResponse(err)
  }
}
