"use client"

import { useRouter } from "next/navigation"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { DEMAND_TYPE_LABEL } from "@/lib/admin/careers"

const input = "min-h-11 w-full rounded-button border border-border bg-surface px-3 text-sm"
const label = "flex min-w-0 flex-col gap-1 text-sm font-medium"

function useSend(url: string, method: "POST" | "PATCH" = "POST") {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null)
  async function send(body: unknown, done: (out: { changed?: number; saved?: number }) => string) {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      const out = (await res.json().catch(() => null)) as { error?: string; changed?: number; saved?: number } | null
      setMessage(
        res.ok && out
          ? { ok: true, text: done(out) }
          : { ok: false, text: out?.error ?? "That didn't save. Try again." }
      )
      router.refresh()
    } catch {
      setMessage({ ok: false, text: "No connection. Try again." })
    } finally {
      setBusy(false)
    }
  }
  const note = message && (
    <p role="status" className={message.ok ? "text-sm text-success-strong" : "text-sm text-danger-strong"}>
      {message.text}
    </p>
  )
  return { send, busy, note }
}

const text = (data: FormData, key: string) => String(data.get(key) ?? "").trim()

function Countries() {
  return (
    <label className={label}>
      Country
      <select name="country" className={input}>
        <option value="CA">Canada</option>
        <option value="UK">UK</option>
        <option value="US">USA</option>
      </select>
    </label>
  )
}

/** Adds or re-verifies an occupation and, if filled in, its demand in one province, region or country. */
export function OccupationForm() {
  const { send, busy, note } = useSend("/api/admin/occupations")
  return (
    <form
      data-testid="occupation-form"
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        const d = new FormData(e.currentTarget)
        const demandLabel = text(d, "label")
        void send(
          {
            country: text(d, "country"),
            code: text(d, "code"),
            title: text(d, "title"),
            source_url: text(d, "source_url"),
            demand: demandLabel
              ? {
                  label: demandLabel,
                  region: text(d, "region"),
                  source_type: text(d, "source_type"),
                  valid_from: text(d, "valid_from"),
                  valid_to: text(d, "valid_to") || null,
                  source_url: text(d, "demand_url"),
                }
              : null,
          },
          () => "Saved and marked verified today."
        )
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Countries />
        <label className={label}>
          Code (NOC 2021, or UK SOC 2020)
          <input name="code" required className={input} />
        </label>
        <label className={label}>
          Occupation title
          <input name="title" required className={input} />
        </label>
        <label className={label}>
          Occupation source
          <input name="source_url" type="url" required className={input} />
        </label>
        <label className={label}>
          Demand wording (blank = no demand record)
          <input name="label" className={input} />
        </label>
        <label className={label}>
          Province or region (blank = whole country)
          <input name="region" className={input} />
        </label>
        <label className={label}>
          Demand type
          <select name="source_type" className={input}>
            {Object.entries(DEMAND_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Demand source
          <input name="demand_url" type="url" className={input} />
        </label>
        <label className={label}>
          Valid from
          <input name="valid_from" type="date" className={input} />
        </label>
        <label className={label}>
          Valid to (blank = no end)
          <input name="valid_to" type="date" className={input} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={busy}>
          Save occupation
        </Button>
        {note}
      </div>
    </form>
  )
}

/** Pastes an official list of work-permit fields. Saving a code already held re-verifies it. */
export function FieldImportForm() {
  const { send, busy, note } = useSend("/api/admin/work-permit-fields")
  return (
    <form
      data-testid="field-form"
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        const d = new FormData(e.currentTarget)
        void send(
          {
            country: text(d, "country"),
            lines: text(d, "lines"),
            eligible_from: text(d, "eligible_from"),
            eligible_to: text(d, "eligible_to") || null,
            source_url: text(d, "source_url"),
          },
          (out) => `${out.saved ?? 0} fields saved.`
        )
      }}
    >
      <label className={label}>
        Fields, one per line: code | title | category
        <textarea name="lines" required rows={5} className={`${input} py-2 font-mono`} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Countries />
        <label className={label}>
          Official page
          <input name="source_url" type="url" required className={input} />
        </label>
        <label className={label}>
          Eligible from
          <input name="eligible_from" type="date" required className={input} />
        </label>
        <label className={label}>
          Eligible to (blank = no end)
          <input name="eligible_to" type="date" className={input} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={busy}>
          Save fields
        </Button>
        {note}
      </div>
    </form>
  )
}

type Link = { programme_id: string; occupation_id: string; label: string; rationale: string }

/** Suggested links waiting for an editor. Nothing is ticked to begin with. */
export function LinkReview({ links }: { links: Link[] }) {
  const { send, busy, note } = useSend("/api/admin/programme-occupations")
  const [chosen, setChosen] = React.useState<string[]>([])
  const key = (l: Link) => `${l.programme_id}/${l.occupation_id}`
  const act = (action: "approve" | "reject") =>
    send(
      {
        action,
        links: links
          .filter((l) => chosen.includes(key(l)))
          .map(({ programme_id, occupation_id }) => ({ programme_id, occupation_id })),
      },
      (out) => `${out.changed ?? 0} ${action === "approve" ? "approved" : "rejected"}.`
    ).then(() => setChosen([]))
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {links.map((l) => (
          <li key={key(l)} data-testid="link-suggestion">
            <label className="flex min-h-11 items-start gap-3 rounded-button border border-border p-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={chosen.includes(key(l))}
                onChange={() =>
                  setChosen(chosen.includes(key(l)) ? chosen.filter((k) => k !== key(l)) : [...chosen, key(l)])
                }
              />
              <span>
                <span className="font-medium">{l.label}</span>
                {l.rationale && <span className="block text-xs text-muted-foreground">{l.rationale}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy || chosen.length === 0} onClick={() => void act("approve")}>
          Approve selected ({chosen.length})
        </Button>
        <Button size="sm" variant="outline" disabled={busy || chosen.length === 0} onClick={() => void act("reject")}>
          Reject selected
        </Button>
        {note}
      </div>
    </div>
  )
}

type Option = { id: string; label: string; country: string }

/** Links a programme to an occupation by hand, or asks the AI for suggestions to review. */
export function LinkForm({ programmes, occupations }: { programmes: Option[]; occupations: Option[] }) {
  const { send, busy, note } = useSend("/api/admin/programme-occupations")
  const [programme, setProgramme] = React.useState("")
  const [occupation, setOccupation] = React.useState("")
  const country = programmes.find((p) => p.id === programme)?.country
  return (
    <div className="flex flex-col gap-3" data-testid="link-form">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          Programme
          <select
            value={programme}
            onChange={(e) => {
              setProgramme(e.target.value)
              setOccupation("")
            }}
            className={input}
          >
            <option value="">Choose…</option>
            {programmes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          Occupation
          <select value={occupation} onChange={(e) => setOccupation(e.target.value)} className={input}>
            <option value="">Choose…</option>
            {occupations
              .filter((o) => o.country === country)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={busy || !programme || !occupation}
          onClick={() =>
            void send(
              { action: "add", programme_id: programme, occupation_id: occupation },
              () => "Linked and approved."
            )
          }
        >
          Link these
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !programme}
          onClick={() =>
            void send(
              { action: "suggest", programme_id: programme },
              (out) => `${out.changed ?? 0} suggestions to review.`
            )
          }
        >
          Suggest with AI
        </Button>
        {note}
      </div>
    </div>
  )
}

export function InstitutionForm({
  institution,
}: {
  institution: {
    id: string
    country: string
    institution_type: string
    dli_number: string | null
    pgwp_eligible: string
    pgwp_source_url: string | null
  }
}) {
  const { send, busy, note } = useSend(`/api/admin/institutions/${institution.id}`, "PATCH")
  return (
    <form
      data-testid="institution-form"
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        const d = new FormData(e.currentTarget)
        void send(
          {
            institution_type: text(d, "institution_type"),
            dli_number: text(d, "dli_number") || null,
            pgwp_eligible: text(d, "pgwp_eligible"),
            pgwp_source_url: text(d, "pgwp_source_url") || null,
          },
          () => "Saved, checked today."
        )
      }}
    >
      <label className={label}>
        Type
        <select name="institution_type" defaultValue={institution.institution_type} className={input}>
          <option value="university">University</option>
          <option value="public_college">Public college</option>
          <option value="private_college">Private college</option>
        </select>
      </label>
      {institution.country === "CA" && (
        <label className={label}>
          DLI number
          <input name="dli_number" defaultValue={institution.dli_number ?? ""} className={input} />
        </label>
      )}
      <label className={label}>
        Offers programmes that qualify for a post-study work permit?
        <select name="pgwp_eligible" defaultValue={institution.pgwp_eligible} className={input}>
          <option value="unknown">Not checked</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>
      <label className={label}>
        Official page checked
        <input name="pgwp_source_url" type="url" defaultValue={institution.pgwp_source_url ?? ""} className={input} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={busy}>
          Save
        </Button>
        {note}
      </div>
    </form>
  )
}
