import "server-only"

import type { Json } from "@/lib/db/database.types"
import { serviceClient } from "@/lib/db/service"

import { settingsSchema, type SettingKey, type Settings } from "./schema"

export * from "./schema"

const TTL_MS = 30_000
let cached: { at: number; value: Settings } | undefined

/** Admin settings, cached for 30 seconds per server instance. Falls back to defaults if the read fails. */
export async function getSettings(): Promise<Settings> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value
  const { data, error } = await serviceClient().from("app_setting").select("key, value")
  if (error) {
    console.error("app_setting read failed:", error.message)
    return cached?.value ?? settingsSchema.parse({})
  }
  const raw = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]))
  const parsed = settingsSchema.safeParse(raw)
  const value = parsed.success ? parsed.data : settingsSchema.parse({})
  if (!parsed.success) console.error("app_setting is invalid; using defaults")
  cached = { at: Date.now(), value }
  return value
}

/** Saves one setting. Null means "use the code default", so the row is removed. */
export async function saveSetting<K extends SettingKey>(key: K, value: Settings[K], adminId: string) {
  const db = serviceClient().from("app_setting")
  const { error } =
    value === null
      ? await db.delete().eq("key", key)
      : await db.upsert({
          key,
          value: value as unknown as NonNullable<Json>,
          updated_by: adminId,
          updated_at: new Date().toISOString(),
        })
  if (error) throw error
  cached = undefined
}
