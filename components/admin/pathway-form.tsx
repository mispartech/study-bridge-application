"use client"

import { useRouter } from "next/navigation"
import * as React from "react"

import { StatusBadge } from "@/components/admin/status-badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { SIGNAL_KEYS, SIGNALS, type Pathway, type SignalKey } from "@/lib/match/pathways"

const input = "min-h-11 rounded-button border border-border bg-surface px-3 text-sm"

/**
 * Edits one pathway: its wording, whether students can choose it, its order, and how much each signal counts.
 * With no pathway given, it creates one. Weights are relative: 40 and 20 means the first counts twice as much.
 */
export function PathwayForm({ pathway }: { pathway: Pathway | null }) {
  const router = useRouter()
  const creating = pathway === null
  const [key, setKey] = React.useState(pathway?.key ?? "")
  const [label, setLabel] = React.useState(pathway?.label ?? "")
  const [description, setDescription] = React.useState(pathway?.description ?? "")
  const [active, setActive] = React.useState(pathway?.active ?? true)
  const [order, setOrder] = React.useState(String(pathway?.sort_order ?? 100))
  const [weights, setWeights] = React.useState<Partial<Record<SignalKey, string>>>(
    Object.fromEntries(SIGNAL_KEYS.map((s) => [s, String(pathway?.signals[s] ?? 0)]))
  )
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null)
  const total = SIGNAL_KEYS.reduce((n, s) => n + (Number(weights[s]) || 0), 0)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    const res = await fetch("/api/admin/pathways", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        key: key.trim(),
        label,
        description,
        active,
        sort_order: Number(order) || 0,
        signals: Object.fromEntries(SIGNAL_KEYS.map((s) => [s, Math.round(Number(weights[s]) || 0)])),
      }),
    })
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    setBusy(false)
    if (!res.ok) return setMessage({ ok: false, text: body?.error ?? "That didn't save. Try again." })
    setMessage({ ok: true, text: "Saved. Results use it within a few minutes." })
    if (creating) {
      setKey("")
      setLabel("")
      setDescription("")
    }
    router.refresh()
  }

  return (
    <Card data-testid={creating ? "pathway-new" : `pathway-${pathway.key}`} className="gap-3">
      <form onSubmit={save} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-base font-bold">{creating ? "Add a pathway" : pathway.label}</h2>
          {!creating && (
            <StatusBadge tone={pathway.active ? "success" : "neutral"}>
              {pathway.active ? "Students can choose it" : "Switched off"}
            </StatusBadge>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {creating && (
            <label className="flex flex-col gap-1 text-sm font-medium">
              Key (lowercase, underscores)
              <input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                pattern="[a-z][a-z_]{1,39}"
                required
                className={input}
              />
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm font-medium">
            Label students see
            <input value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={60} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
            One-line description
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={280}
              className={input}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Order in the list
            <input
              type="number"
              min={0}
              max={1000}
              value={order}
              onChange={(e) => setOrder(e.target.value)}
              className={input}
            />
          </label>
          <label className="flex min-h-11 items-center gap-2 self-end text-sm font-medium">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Students can choose it
          </label>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">
            How much each signal counts <span className="font-normal text-muted-foreground">(total {total})</span>
          </legend>
          <ul className="grid gap-2 sm:grid-cols-2">
            {SIGNAL_KEYS.map((s) => (
              <li key={s} className="flex items-center gap-3 rounded-button border border-border p-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  aria-label={`Weight for ${SIGNALS[s].label}`}
                  value={weights[s] ?? "0"}
                  onChange={(e) => setWeights({ ...weights, [s]: e.target.value })}
                  className={`${input} w-20 shrink-0`}
                />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium">{SIGNALS[s].label}</span>
                  <span className="text-xs text-muted-foreground">
                    {SIGNALS[s].available
                      ? SIGNALS[s].description
                      : "No data yet, so it doesn't count until it arrives."}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={busy}>
            {creating ? "Add pathway" : "Save"}
          </Button>
          {message && (
            <p role="status" className={message.ok ? "text-sm text-success-strong" : "text-sm text-danger-strong"}>
              {message.text}
            </p>
          )}
        </div>
      </form>
    </Card>
  )
}
