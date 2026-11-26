import { connection } from "next/server"

import { AdvisorLimitSetting, ModelSettings, PriceSettings } from "@/components/admin/settings-form"
import { PageHeader } from "@/components/admin/page-header"
import { StatusBadge } from "@/components/admin/status-badge"
import { Card } from "@/components/ui/card"
import { FREE_ADVISOR_MESSAGES_PER_DAY } from "@/lib/ai/advisor-quota"
import { AI_CONFIG } from "@/lib/ai/config"
import { demoModeEnabled } from "@/lib/match/catalogue"
import { ENV_NAMES } from "@/lib/admin/env"
import { AI_TASKS, getSettings, MODEL_CHOICES } from "@/lib/settings"
import { requireStaff } from "@/lib/auth/staff-page"

export default async function Page() {
  await connection()
  await requireStaff("settings")
  const settings = await getSettings()
  const defaults = Object.fromEntries(AI_TASKS.map((t) => [t, AI_CONFIG[t]]))
  const priced = [...new Set([...MODEL_CHOICES, ...Object.values(defaults).map((r) => `${r.provider}:${r.model}`)])]
  return (
    <>
      <PageHeader
        title="Settings"
        description="Models, prices and limits. Every change is recorded in the audit log."
      />
      <ModelSettings tasks={AI_TASKS} choices={MODEL_CHOICES} defaults={defaults} current={settings.ai_models} />
      <PriceSettings models={priced} current={settings.model_prices} />
      <AdvisorLimitSetting current={settings.advisor_free_limit} fallback={FREE_ADVISOR_MESSAGES_PER_DAY} />
      <Card className="gap-2">
        <h2 className="font-heading text-base font-bold">This deployment</h2>
        <p className="text-sm">
          Environment: <strong>{process.env.VERCEL_ENV ?? "local"}</strong> · Demo data:{" "}
          <strong>{demoModeEnabled() ? "on" : "off"}</strong>
        </p>
        <p className="text-xs text-muted-foreground">
          Change these in Vercel, then redeploy. Values are never shown here.
        </p>
        {/* Status first, at a fixed width, so it can't be read as belonging to the next column's name. */}
        <ul className="grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
          {ENV_NAMES.map((name) => (
            <li key={name} className="flex items-center gap-2">
              <StatusBadge tone={process.env[name] ? "success" : "danger"} className="w-16 justify-center">
                {process.env[name] ? "set" : "missing"}
              </StatusBadge>
              <span className="min-w-0 font-mono text-xs break-all">{name}</span>
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}
