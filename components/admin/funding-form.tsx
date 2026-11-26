"use client"

import { useRouter } from "next/navigation"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { FUNDING_TYPE_LABEL, FUNDING_TYPES, INTERNATIONAL_LABEL } from "@/lib/admin/funding"
import type { Tables } from "@/lib/db/database.types"
import { LEVEL_LABEL } from "@/lib/match/levels"
import { FIELDS } from "@/lib/match/labels"

const input = "min-h-11 w-full rounded-button border border-border bg-surface px-3 text-sm"
const LEVELS = ["masters", "postgraduate_certificate", "graduate_diploma"] as const
const csv = (v: string) =>
  v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)

type Institution = { id: string; name: string }

/**
 * Adds or edits one funding record from the funder's own page. Saving marks it verified today, so check the page
 * first. International eligibility must be chosen: funding that doesn't say is never shown to students.
 */
export function FundingForm({
  record,
  institutions,
}: {
  record: Tables<"scholarship"> | null
  institutions: Institution[]
}) {
  const router = useRouter()
  const [f, setF] = React.useState({
    name: record?.name ?? "",
    funder: record?.funder ?? "",
    funding_type: record?.funding_type ?? "scholarship",
    countries: (record?.countries ?? ["CA"]) as string[],
    regions: (record?.regions ?? []).join(", "),
    university_id: record?.university_id ?? "",
    levels: (record?.levels ?? []) as string[],
    fields: (record?.fields ?? []) as string[],
    nationalities: (record?.eligible_nationalities ?? []).join(", "),
    open_to_international: record?.open_to_international ?? "",
    eligible_from: record?.eligible_from ?? "admission",
    automatic: record?.automatic ?? false,
    coverage: record?.coverage ?? "partial",
    amount: record?.amount_minor == null ? "" : String(record.amount_minor / 100),
    currency: record?.currency ?? "",
    percent: record?.percent_of_tuition == null ? "" : String(record.percent_of_tuition),
    renewable: record?.renewable ?? false,
    deadline: record?.deadline ?? "",
    url: record?.url ?? "",
    source_url: record?.source_url ?? "",
    confidence: record?.confidence ?? "official",
  })
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null)
  const set = <K extends keyof typeof f>(key: K, value: (typeof f)[K]) => setF({ ...f, [key]: value })
  const toggle = (key: "countries" | "levels" | "fields", value: string) =>
    set(key, f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    const body = {
      name: f.name,
      funder: f.funder,
      funding_type: f.funding_type,
      countries: f.countries,
      regions: csv(f.regions),
      university_id: f.university_id || null,
      levels: f.levels,
      fields: f.fields,
      eligible_nationalities: csv(f.nationalities).map((n) => n.toUpperCase()),
      min_uk_class: null,
      open_to_international: f.open_to_international || undefined,
      eligible_from: f.eligible_from,
      automatic: f.automatic,
      coverage: f.coverage,
      amount: f.amount === "" ? null : Number(f.amount),
      currency: f.currency || null,
      percent_of_tuition: f.percent === "" ? null : Number(f.percent),
      renewable: f.renewable,
      deadline: f.deadline || null,
      url: f.url,
      source_url: f.source_url,
      confidence: f.confidence,
    }
    const res = await fetch("/api/admin/funding", {
      method: record ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(record ? { id: record.id, record: body } : body),
    })
    const out = (await res.json().catch(() => null)) as { error?: string } | null
    setBusy(false)
    if (!res.ok) return setMessage({ ok: false, text: out?.error ?? "That didn't save. Try again." })
    setMessage({ ok: true, text: "Saved and marked verified today." })
    router.refresh()
  }

  const label = "flex flex-col gap-1 text-sm font-medium"
  return (
    <form onSubmit={save} className="flex flex-col gap-3" data-testid="funding-form">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Name
          <input required value={f.name} onChange={(e) => set("name", e.target.value)} className={input} />
        </label>
        <label className={label}>
          Funder
          <input required value={f.funder} onChange={(e) => set("funder", e.target.value)} className={input} />
        </label>
        <label className={label}>
          Type
          <select
            value={f.funding_type}
            onChange={(e) => set("funding_type", e.target.value as typeof f.funding_type)}
            className={input}
          >
            {FUNDING_TYPES.map((t) => (
              <option key={t} value={t}>
                {FUNDING_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Open to international students?
          <select
            required
            value={f.open_to_international}
            onChange={(e) => set("open_to_international", e.target.value as typeof f.open_to_international)}
            className={input}
          >
            <option value="">Choose…</option>
            {(Object.keys(INTERNATIONAL_LABEL) as (keyof typeof INTERNATIONAL_LABEL)[]).map((k) => (
              <option key={k} value={k}>
                {INTERNATIONAL_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Available
          <select
            value={f.eligible_from}
            onChange={(e) => set("eligible_from", e.target.value as typeof f.eligible_from)}
            className={input}
          >
            <option value="admission">On admission (counted in results)</option>
            <option value="after_start">Only after classes start (not counted)</option>
          </select>
        </label>
        <label className={label}>
          Only at one institution
          <select value={f.university_id} onChange={(e) => set("university_id", e.target.value)} className={input}>
            <option value="">Any institution</option>
            {institutions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Provinces or regions (comma-separated, blank = anywhere)
          <input value={f.regions} onChange={(e) => set("regions", e.target.value)} className={input} />
        </label>
        <label className={label}>
          Nationalities (2-letter codes, blank = all)
          <input value={f.nationalities} onChange={(e) => set("nationalities", e.target.value)} className={input} />
        </label>
        <label className={label}>
          Coverage
          <select
            value={f.coverage}
            onChange={(e) => set("coverage", e.target.value as typeof f.coverage)}
            className={input}
          >
            <option value="partial">Partial</option>
            <option value="tuition">Tuition</option>
            <option value="full">Full</option>
            <option value="stipend">Stipend</option>
          </select>
        </label>
        <div className="grid grid-cols-[1fr_7rem] gap-2">
          <label className={label}>
            Amount a year
            <input
              type="number"
              min={0}
              step="0.01"
              value={f.amount}
              onChange={(e) => set("amount", e.target.value)}
              className={input}
            />
          </label>
          <label className={label}>
            Currency
            <select value={f.currency} onChange={(e) => set("currency", e.target.value)} className={input}>
              <option value="">—</option>
              <option value="CAD">CAD</option>
              <option value="GBP">GBP</option>
              <option value="USD">USD</option>
            </select>
          </label>
        </div>
        <label className={label}>
          Or share of tuition (%)
          <input
            type="number"
            min={1}
            max={100}
            value={f.percent}
            onChange={(e) => set("percent", e.target.value)}
            className={input}
          />
        </label>
        <label className={label}>
          Deadline
          <input type="date" value={f.deadline} onChange={(e) => set("deadline", e.target.value)} className={input} />
        </label>
        <label className={label}>
          Link students use (funder&apos;s page)
          <input required type="url" value={f.url} onChange={(e) => set("url", e.target.value)} className={input} />
        </label>
        <label className={label}>
          Source checked
          <input
            required
            type="url"
            value={f.source_url}
            onChange={(e) => set("source_url", e.target.value)}
            className={input}
          />
        </label>
      </div>

      <fieldset className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <legend className="mb-1 font-medium">Countries</legend>
        {["CA", "UK", "US"].map((c) => (
          <label key={c} className="flex min-h-9 items-center gap-2">
            <input type="checkbox" checked={f.countries.includes(c)} onChange={() => toggle("countries", c)} />
            {c}
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <legend className="mb-1 font-medium">Levels (none ticked = all)</legend>
        {LEVELS.map((l) => (
          <label key={l} className="flex min-h-9 items-center gap-2">
            <input type="checkbox" checked={f.levels.includes(l)} onChange={() => toggle("levels", l)} />
            {LEVEL_LABEL[l]}
          </label>
        ))}
      </fieldset>
      <fieldset className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <legend className="mb-1 font-medium">Fields (none ticked = all)</legend>
        {FIELDS.map((fl) => (
          <label key={fl.value} className="flex min-h-9 items-center gap-2">
            <input type="checkbox" checked={f.fields.includes(fl.value)} onChange={() => toggle("fields", fl.value)} />
            {fl.label}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
        <label className="flex min-h-9 items-center gap-2">
          <input type="checkbox" checked={f.automatic} onChange={(e) => set("automatic", e.target.checked)} />
          Awarded automatically with the offer
        </label>
        <label className="flex min-h-9 items-center gap-2">
          <input type="checkbox" checked={f.renewable} onChange={(e) => set("renewable", e.target.checked)} />
          Renewable
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={busy}>
          {record ? "Save (marks verified today)" : "Add funding"}
        </Button>
        {message && (
          <p role="status" className={message.ok ? "text-sm text-success-strong" : "text-sm text-danger-strong"}>
            {message.text}
          </p>
        )}
      </div>
    </form>
  )
}
