"use client"

import { useRouter } from "next/navigation"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

const input = "min-h-11 w-full rounded-button border border-border bg-surface px-3 text-sm"

export function MarketRateForm() {
  const router = useRouter()
  const [form, setForm] = React.useState({ currency: "GBP", rate: "", source_url: "", observed_on: "" })
  const [message, setMessage] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const field = (name: keyof typeof form) => ({
    value: form[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm({ ...form, [name]: e.target.value }),
  })

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    const res = await fetch("/api/admin/fx", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...form, rate: Number(form.rate) }),
    })
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    setBusy(false)
    setMessage(res.ok ? "Saved" : (body?.error ?? "That didn't save."))
    if (res.ok) router.refresh()
  }

  return (
    <Card className="gap-2">
      <h2 className="font-heading text-base font-bold">Enter this week&apos;s market rate</h2>
      <form onSubmit={save} className="grid gap-2 text-sm sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          Currency
          <select className={input} {...field("currency")}>
            <option>GBP</option>
            <option>CAD</option>
            <option>USD</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Naira per unit
          <input required inputMode="decimal" className={input} {...field("rate")} />
        </label>
        <label className="flex flex-col gap-1">
          Date of the rate
          <input required type="date" className={input} {...field("observed_on")} />
        </label>
        <label className="flex flex-col gap-1">
          Source
          <input required type="url" className={input} {...field("source_url")} />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" size="sm" loading={busy}>
            Save market rate
          </Button>
          {message && <span role="status">{message}</span>}
        </div>
      </form>
    </Card>
  )
}
