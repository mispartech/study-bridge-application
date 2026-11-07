"use client"

import { useRouter } from "next/navigation"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { Tables } from "@/lib/db/database.types"

const input = "min-h-11 w-full rounded-button border border-border bg-surface px-3 text-sm"
const blank = {
  country: "UK",
  rule_type: "post_study_work",
  description: "",
  value: "{}",
  effective_from: "",
  effective_to: "",
  source_url: "",
  confidence: "official",
}
const RULE_TYPES = [
  "proof_of_funds",
  "funds_holding_period",
  "post_study_work",
  "nationality_restriction",
  "length_of_stay",
  "government_fee",
  "attestation_letter",
  "source_of_funds",
  "processing_location",
]

export function VisaRuleForm({ rule }: { rule: Tables<"visa_rule"> | null }) {
  const router = useRouter()
  const [form, setForm] = React.useState(
    rule
      ? {
          country: rule.country as string,
          rule_type: rule.rule_type as string,
          description: rule.description,
          value: JSON.stringify(rule.value),
          effective_from: rule.effective_from,
          effective_to: rule.effective_to ?? "",
          source_url: rule.source_url,
          confidence: rule.confidence as string,
        }
      : blank
  )
  const [error, setError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const field = (name: keyof typeof form) => ({
    value: form[name],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm({ ...form, [name]: e.target.value }),
  })

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSaved(false)
    let value: unknown
    try {
      value = JSON.parse(form.value)
    } catch {
      setError("Value must be valid JSON.")
      return
    }
    setBusy(true)
    const res = await fetch("/api/admin/visa-rules", {
      method: rule ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...form, value, id: rule?.id, effective_to: form.effective_to || null }),
    })
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    setBusy(false)
    if (!res.ok) {
      setError(body?.error ?? "That didn't save.")
      return
    }
    setSaved(true)
    router.refresh()
  }

  return (
    <Card data-testid="visa-rule" className="gap-2">
      <form onSubmit={save} className="grid gap-2 text-sm sm:grid-cols-2">
        <h2 className="font-heading text-base font-bold sm:col-span-2">
          {rule ? `${rule.country}: ${rule.rule_type}` : "Add a rule"}
        </h2>
        {!rule && (
          <>
            <label className="flex flex-col gap-1">
              Country
              <select className={input} {...field("country")}>
                {["UK", "CA", "US"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              Type
              <select className={input} {...field("rule_type")}>
                {RULE_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
          </>
        )}
        <label className="flex flex-col gap-1 sm:col-span-2">
          Description
          <textarea required rows={2} className={`${input} py-2`} {...field("description")} />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          Value (JSON)
          <input className={`${input} font-mono`} {...field("value")} />
        </label>
        <label className="flex flex-col gap-1">
          In force from
          <input type="date" required className={input} {...field("effective_from")} />
        </label>
        <label className="flex flex-col gap-1">
          Ends (leave empty if open)
          <input type="date" className={input} {...field("effective_to")} />
        </label>
        <label className="flex flex-col gap-1 sm:col-span-2">
          Official source
          <input type="url" required className={input} {...field("source_url")} />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" size="sm" loading={busy}>
            Save and mark verified
          </Button>
          {saved && <span role="status">Saved</span>}
          {error && (
            <span role="alert" className="text-danger-strong">
              {error}
            </span>
          )}
        </div>
      </form>
    </Card>
  )
}
