"use client"

import { useRouter } from "next/navigation"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

const input = "min-h-11 w-full rounded-button border border-border bg-surface px-3 text-sm"

type Ref = { provider: string; model: string }
type Prices = Record<string, { input: number; output: number }>

function useSave() {
  const router = useRouter()
  const [message, setMessage] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  async function save(key: string, value: unknown) {
    setBusy(true)
    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, value }),
    })
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    setBusy(false)
    setMessage(res.ok ? "Saved. Takes effect within 30 seconds." : (body?.error ?? "That didn't save."))
    if (res.ok) router.refresh()
  }
  return { save, message, busy }
}

const spec = (r: Ref) => `${r.provider}:${r.model}`
const toRef = (s: string): Ref => ({ provider: s.slice(0, s.indexOf(":")), model: s.slice(s.indexOf(":") + 1) })

export function ModelSettings({
  tasks,
  choices,
  defaults,
  current,
}: {
  tasks: readonly string[]
  choices: readonly string[]
  defaults: Record<string, Ref>
  current: Record<string, Ref | undefined>
}) {
  const { save, message, busy } = useSave()
  const [picked, setPicked] = React.useState<Record<string, string>>(
    Object.fromEntries(tasks.map((t) => [t, current[t] ? spec(current[t]) : ""]))
  )
  function submit(event: React.FormEvent) {
    event.preventDefault()
    const value = Object.fromEntries(
      Object.entries(picked)
        .filter(([, s]) => s)
        .map(([t, s]) => [t, toRef(s)])
    )
    void save("ai_models", value)
  }
  return (
    <Card className="gap-2">
      <h2 className="font-heading text-base font-bold">Model per task</h2>
      <p className="text-xs text-muted-foreground">
        Students never see which model answered. &quot;Default&quot; uses config/ai.json.
      </p>
      <form onSubmit={submit} className="grid gap-2 text-sm sm:grid-cols-3">
        {tasks.map((task) => (
          <label key={task} className="flex flex-col gap-1">
            <span className="capitalize">{task}</span>
            <select
              className={input}
              value={picked[task]}
              onChange={(e) => setPicked({ ...picked, [task]: e.target.value })}
            >
              <option value="">Default ({defaults[task] ? spec(defaults[task]) : "none"})</option>
              {choices.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        ))}
        <div className="flex items-center gap-3 sm:col-span-3">
          <Button type="submit" size="sm" loading={busy}>
            Save models
          </Button>
          {message && <span role="status">{message}</span>}
        </div>
      </form>
    </Card>
  )
}

export function PriceSettings({ models, current }: { models: string[]; current: Prices }) {
  const { save, message, busy } = useSave()
  const [rows, setRows] = React.useState(
    Object.fromEntries(
      models.map((m) => [m, { input: String(current[m]?.input ?? ""), output: String(current[m]?.output ?? "") }])
    )
  )
  function submit(event: React.FormEvent) {
    event.preventDefault()
    const value: Prices = {}
    for (const [m, r] of Object.entries(rows)) {
      if (r.input !== "" && r.output !== "") value[m] = { input: Number(r.input), output: Number(r.output) }
    }
    void save("model_prices", value)
  }
  return (
    <Card className="gap-2">
      <h2 className="font-heading text-base font-bold">Model prices</h2>
      <p className="text-xs text-muted-foreground">
        US dollars per million tokens, copied from each provider&apos;s pricing page. Used only for the cost estimates
        in AI usage.
      </p>
      <form onSubmit={submit} className="flex flex-col gap-2 text-sm">
        {models.map((m) => (
          <div key={m} className="grid grid-cols-[minmax(0,1fr)_6rem_6rem] items-end gap-2">
            <span className="truncate font-mono text-xs">{m}</span>
            <label className="flex flex-col gap-1 text-xs">
              Input
              <input
                inputMode="decimal"
                className={input}
                value={rows[m]?.input ?? ""}
                onChange={(e) => setRows({ ...rows, [m]: { ...rows[m]!, input: e.target.value } })}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Output
              <input
                inputMode="decimal"
                className={input}
                value={rows[m]?.output ?? ""}
                onChange={(e) => setRows({ ...rows, [m]: { ...rows[m]!, output: e.target.value } })}
              />
            </label>
          </div>
        ))}
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" loading={busy}>
            Save prices
          </Button>
          {message && <span role="status">{message}</span>}
        </div>
      </form>
    </Card>
  )
}

export function AdvisorLimitSetting({ current, fallback }: { current: number | null; fallback: number }) {
  const { save, message, busy } = useSave()
  const [value, setValue] = React.useState(current === null ? "" : String(current))
  return (
    <Card className="gap-2">
      <h2 className="font-heading text-base font-bold">Free advisor messages per day</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void save("advisor_free_limit", value === "" ? null : Number(value))
        }}
        className="flex flex-wrap items-end gap-2 text-sm"
      >
        <label className="flex flex-col gap-1">
          Messages (empty = default {fallback})
          <input inputMode="numeric" className={input} value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <Button type="submit" size="sm" loading={busy}>
          Save limit
        </Button>
        {message && <span role="status">{message}</span>}
      </form>
    </Card>
  )
}
