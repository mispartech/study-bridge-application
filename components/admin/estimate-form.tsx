"use client"

import { useRouter } from "next/navigation"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

const input = "min-h-11 w-full rounded-button border border-border bg-surface px-3 text-sm"

export function EstimateForm() {
  const router = useRouter()
  const [message, setMessage] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [item, setItem] = React.useState("flights")

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    const res = await fetch("/api/admin/estimates", { method: "POST", body: new FormData(event.currentTarget) })
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    setBusy(false)
    setMessage(res.ok ? "Saved" : (body?.error ?? "That didn't save."))
    if (res.ok) router.refresh()
  }

  return (
    <Card className="gap-2">
      <h2 className="font-heading text-base font-bold">Add or replace an estimate</h2>
      <form onSubmit={save} className="grid gap-2 text-sm sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          Item
          <select name="item" className={input} value={item} onChange={(e) => setItem(e.target.value)}>
            <option value="flights">Flights from Lagos (one way)</option>
            <option value="health_cover">Health cover</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          Country
          <select name="country" className={input}>
            <option value="UK">UK</option>
            <option value="CA">Canada</option>
          </select>
        </label>
        {item === "flights" ? (
          <label className="flex flex-col gap-1">
            Destination city
            <input name="city" required className={input} placeholder="London" />
          </label>
        ) : (
          <label className="flex flex-col gap-1">
            Province or region
            <input name="region" required className={input} placeholder="Ontario" />
          </label>
        )}
        <label className="flex flex-col gap-1">
          {item === "flights" ? "Median of the quotes" : "Amount"}
          <input name="amount" required inputMode="decimal" className={input} />
        </label>
        <label className="flex flex-col gap-1">
          Currency
          <select name="currency" className={input}>
            <option>NGN</option>
            <option>GBP</option>
            <option>CAD</option>
            <option>USD</option>
          </select>
        </label>
        {item === "health_cover" && (
          <label className="flex min-h-11 items-center gap-2">
            <input name="per_year" type="checkbox" className="size-5" /> Charged per year of study
          </label>
        )}
        <label className="flex flex-col gap-1">
          Date of the quote or rate
          <input name="observed_on" required type="date" className={input} />
        </label>
        <label className="flex flex-col gap-1">
          Source link
          <input name="source_url" required type="url" className={input} />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          Screenshot {item === "flights" ? "(required)" : "(optional)"}
          <input name="evidence" type="file" accept="image/png,image/jpeg,image/webp" required={item === "flights"} />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" size="sm" loading={busy}>
            Save estimate
          </Button>
          {message && <span role="status">{message}</span>}
        </div>
      </form>
    </Card>
  )
}
