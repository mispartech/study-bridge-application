import { connection } from "next/server"

import { AdvisorLimitSetting, ModelSettings, PriceSettings } from "@/components/admin/settings-form"
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
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-xl font-bold">Settings</h1>
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
        <ul className="grid gap-1 text-sm sm:grid-cols-2">
          {ENV_NAMES.map((name) => (
            <li key={name} className="flex justify-between gap-2">
              <span className="font-mono text-xs">{name}</span>
              <span className={process.env[name] ? "text-success-strong" : "text-danger-strong"}>
                {process.env[name] ? "set" : "missing"}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
