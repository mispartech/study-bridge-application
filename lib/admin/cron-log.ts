import "server-only"

import type { Json } from "@/lib/db/database.types"
import { serviceClient } from "@/lib/db/service"

/** Records one scheduled job run for the System page. Never throws: logging must not fail the job. */
export async function logCronRun(job: string, startedAt: Date, ok: boolean, summary: Record<string, unknown>) {
  const { error } = await serviceClient()
    .from("cron_run")
    .insert({
      job,
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      ok,
      summary: summary as NonNullable<Json>,
    })
  if (error) console.error(`cron_run insert failed for ${job}:`, error.message)
}
