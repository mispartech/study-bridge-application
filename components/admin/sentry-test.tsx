"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"

export function SentryTest() {
  const [result, setResult] = React.useState<string | null>(null)

  async function send() {
    const server = await fetch("/api/admin/sentry-test", { method: "POST" })
    let browser = "off (no NEXT_PUBLIC_SENTRY_DSN)"
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      const Sentry = await import("@sentry/nextjs")
      const eventId = Sentry.captureException(
        new Error(`StudyBridge Sentry test (browser) ${new Date().toISOString()}`)
      )
      await Sentry.flush(5000)
      browser = `sent, event ${eventId}`
    }
    setResult(`Server: responded ${server.status}. Browser: ${browser}.`)
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={send} className="self-start">
        Send test errors
      </Button>
      {result && (
        <p role="status" data-testid="sentry-result" className="text-sm">
          {result}
        </p>
      )}
    </div>
  )
}
