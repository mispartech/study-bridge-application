"use client"

import Link from "next/link"
import * as React from "react"

import { Card } from "@/components/ui/card"
import { TRACKER_STAGES, type ChecklistItem } from "@/lib/plan/reminders"

type PlanItem = {
  programme_id: string
  title: string
  place: string
  last_verified_at: string
  stage: string
  checklist: ChecklistItem[]
}

type Upcoming = { programme_id: string; title: string; label: string; date: string; days: number }

const dated = (date: string) =>
  new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

function save(programme_id: string, change: { stage?: string; checklist?: ChecklistItem[] }) {
  return fetch("/api/plan", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ programme_id, ...change }),
  }).then((res) => res.ok)
}

function ProgrammePlan({ item }: { item: PlanItem }) {
  const [stage, setStage] = React.useState(item.stage)
  const [checklist, setChecklist] = React.useState(item.checklist)
  const [failed, setFailed] = React.useState(false)
  const done = checklist.filter((c) => c.done).length
  const keep = (change: { stage?: string; checklist?: ChecklistItem[] }) =>
    save(item.programme_id, change).then((ok) => setFailed(!ok))

  return (
    <Card data-testid="plan-item" className="gap-3">
      <div>
        <h3 className="font-heading text-base font-bold">
          <Link href={`/programmes/${item.programme_id}`} className="underline-offset-4 hover:underline">
            {item.title}
          </Link>
        </h3>
        <p className="text-sm text-muted-foreground">{item.place}</p>
        <p className="text-xs text-muted-foreground">Verified {dated(item.last_verified_at)}</p>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Stage
        <select
          value={stage}
          onChange={(e) => {
            setStage(e.target.value)
            void keep({ stage: e.target.value })
          }}
          className="min-h-11 rounded-button border border-border bg-surface px-3"
        >
          {TRACKER_STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium">
          Documents: {done} of {checklist.length} ready
        </legend>
        {checklist.map((entry, i) => (
          <label key={entry.label} className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-5 accent-primary"
              checked={entry.done}
              onChange={(e) => {
                const next = checklist.map((c, at) => (at === i ? { ...c, done: e.target.checked } : c))
                setChecklist(next)
                void keep({ checklist: next })
              }}
            />
            {entry.label}
          </label>
        ))}
      </fieldset>
      {failed && (
        <p role="alert" className="text-sm text-danger-strong">
          That didn&apos;t save. Please try again.
        </p>
      )}
    </Card>
  )
}

export function PlanBoard({ items, upcoming }: { items: PlanItem[]; upcoming: Upcoming[] }) {
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h2 className="font-heading text-lg font-bold">Coming up</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming deadlines on file.</p>
        ) : (
          <ol data-testid="timeline" className="flex flex-col gap-2">
            {upcoming.map((d) => (
              <li key={`${d.programme_id}-${d.label}-${d.date}`} className="flex justify-between gap-3 text-sm">
                <span>
                  {d.title} <span className="text-muted-foreground">({d.label})</span>
                </span>
                <span className="shrink-0 tabular-nums">{dated(d.date)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-bold">Your programmes</h2>
        {items.map((item) => (
          <ProgrammePlan key={item.programme_id} item={item} />
        ))}
      </section>
    </div>
  )
}
