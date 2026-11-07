"use client"

import { useRouter } from "next/navigation"
import * as React from "react"

import { Button } from "@/components/ui/button"

type ReviewEditorProps = {
  id: string
  status: string
  reason: string
  initial: string
  current: string | null
  sourceUrl: string | null
  sourceText: string | null
}

const box = "w-full rounded-button border border-border bg-surface p-3 font-mono text-xs"

export function ReviewEditor({ id, status, reason, initial, current, sourceUrl, sourceText }: ReviewEditorProps) {
  const router = useRouter()
  const [text, setText] = React.useState(initial)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [view, setView] = React.useState<"page" | "text">(sourceText ? "text" : "page")

  async function decide(action: "approve" | "reject") {
    setError(null)
    let record: unknown
    try {
      record = JSON.parse(text)
    } catch {
      setError("That isn't valid JSON.")
      return
    }
    setBusy(true)
    const res = await fetch(`/api/admin/review/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, record }),
    })
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    setBusy(false)
    if (res.ok) {
      router.push("/admin/review")
      router.refresh()
    } else setError(body?.error ?? "That didn't work.")
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="flex flex-col gap-2">
        <h1 className="font-heading text-lg font-bold">Proposed record</h1>
        <p className="text-sm text-muted-foreground">{reason}</p>
        <textarea
          aria-label="Proposed record"
          rows={30}
          className={box}
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={status !== "pending"}
        />
        {error && (
          <p role="alert" className="text-sm text-danger-strong">
            {error}
          </p>
        )}
        {status === "pending" ? (
          <div className="flex gap-2">
            <Button loading={busy} onClick={() => decide("approve")}>
              Approve and publish
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => decide("reject")}>
              Reject
            </Button>
          </div>
        ) : (
          <p className="text-sm">This record was {status}.</p>
        )}
        {current && (
          <details className="text-sm">
            <summary>Current record</summary>
            <pre className={box}>{current}</pre>
          </details>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-lg font-bold">Source</h2>
          {sourceUrl && (
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="text-sm underline">
              Open source page
            </a>
          )}
        </div>
        <div className="flex gap-2 text-sm">
          <Button size="sm" variant={view === "text" ? "primary" : "outline"} onClick={() => setView("text")}>
            Saved text
          </Button>
          <Button size="sm" variant={view === "page" ? "primary" : "outline"} onClick={() => setView("page")}>
            Live page
          </Button>
        </div>
        {view === "page" && sourceUrl ? (
          <>
            <iframe title="Source page" src={sourceUrl} sandbox="" className="h-[36rem] w-full rounded-button border" />
            <p className="text-xs text-muted-foreground">Some sites refuse to appear here. Use the link above.</p>
          </>
        ) : (
          <pre data-testid="source-text" className={`${box} h-[36rem] overflow-auto whitespace-pre-wrap`}>
            {sourceText ?? "No saved text for this record."}
          </pre>
        )}
      </section>
    </div>
  )
}
