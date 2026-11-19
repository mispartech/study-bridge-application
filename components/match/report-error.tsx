"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"

export function ReportError({ programmeId }: { programmeId: string }) {
  const [open, setOpen] = React.useState(false)
  const [message, setMessage] = React.useState("")
  const [state, setState] = React.useState<"idle" | "sending" | "sent" | "failed">("idle")

  async function send(event: React.FormEvent) {
    event.preventDefault()
    setState("sending")
    const res = await fetch("/api/error-reports", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ programme_id: programmeId, message }),
    })
    setState(res.ok ? "sent" : "failed")
  }

  if (state === "sent") {
    return (
      <p role="status" data-testid="report-sent" className="text-sm text-muted-foreground">
        Thanks. We&apos;ll check this against the official page.
      </p>
    )
  }
  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Report an error
      </Button>
    )
  }
  return (
    <form onSubmit={send} className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm font-medium">
        What looks wrong?
        <textarea
          rows={3}
          required
          minLength={5}
          maxLength={1000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="rounded-button border border-border bg-surface px-3 py-2 text-[0.9375rem]"
        />
      </label>
      <Button type="submit" variant="outline" loading={state === "sending"}>
        Send report
      </Button>
      {state === "failed" && (
        <p role="alert" className="text-sm text-danger-strong">
          That didn&apos;t send. Please try again.
        </p>
      )}
    </form>
  )
}
