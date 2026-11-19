"use client"

import { Mail } from "lucide-react"
import Link from "next/link"
import * as React from "react"

import { useTurnstile } from "@/components/account/turnstile"
import { Button } from "@/components/ui/button"
import { track } from "@/lib/analytics/track"
import type { MatchProfile } from "@/lib/match/types"
import { REPORT_CONSENT_TEXT } from "@/lib/report/consent"
import { cn } from "@/lib/utils"

const input = "h-11 w-full rounded-button border border-border bg-surface px-3 text-[0.9375rem]"

/** Sticky "Email me this report". The two consents are separate and start unticked. */
export function EmailReport({ profile, signedIn }: { profile: MatchProfile; signedIn: boolean }) {
  const [open, setOpen] = React.useState(false)
  const [email, setEmail] = React.useState("")
  const [reminders, setReminders] = React.useState(false)
  const [marketing, setMarketing] = React.useState(false)
  const [state, setState] = React.useState<"idle" | "sending" | "sent" | "failed">("idle")
  const [error, setError] = React.useState<string | null>(null)
  const { box: captchaBox, ...captcha } = useTurnstile({ invisible: true, lazy: true })
  const panel = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (open) panel.current?.scrollIntoView({ block: "nearest" })
  }, [open])

  async function send(event: React.FormEvent) {
    event.preventDefault()
    setState("sending")
    setError(null)
    const token = await captcha.nextToken()
    const res = await fetch("/api/report", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        profile,
        reminders_consent: reminders,
        marketing_consent: marketing,
        ...(token && { turnstile_token: token }),
      }),
    }).catch(() => null)
    captcha.reset() // a token works once
    if (res?.ok) {
      track("report_emailed")
      setState("sent")
      return
    }
    const body = (await res?.json().catch(() => null)) as { error?: string } | null
    setError(body?.error ?? "We couldn't send that. Check your connection and try again.")
    setState("failed")
  }

  return (
    <div
      ref={panel}
      data-testid="email-report"
      className={cn(
        "rounded-card border border-border bg-surface p-3",
        // Only the closed button stays pinned: the open form is taller than a small screen's free space.
        !open &&
          state !== "sent" &&
          "sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 shadow-lg lg:bottom-4"
      )}
    >
      {state === "sent" ? (
        <div role="status" className="flex flex-col gap-1 text-sm">
          <p className="font-semibold">Sent to {email}. Check your inbox in a minute or two.</p>
          {!signedIn && (
            <p className="text-muted-foreground">
              The email has a button to open these results on any device.{" "}
              <Link href="/sign-in?reason=save&next=/discover" className="font-medium underline underline-offset-4">
                Or create a free account now
              </Link>{" "}
              to save programmes and get reminders.
            </p>
          )}
        </div>
      ) : !open ? (
        <Button
          variant="outline"
          block
          onClick={() => {
            setOpen(true)
            captcha.start()
          }}
        >
          <Mail aria-hidden /> Email me this report
        </Button>
      ) : (
        <form onSubmit={send} className="flex flex-col gap-2 text-sm">
          <label className="flex flex-col gap-1 font-medium">
            Email address
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={input}
            />
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              className="size-5 accent-primary"
              checked={reminders}
              onChange={(e) => setReminders(e.target.checked)}
            />
            {REPORT_CONSENT_TEXT.reminders}
          </label>
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              className="size-5 accent-primary"
              checked={marketing}
              onChange={(e) => setMarketing(e.target.checked)}
            />
            {REPORT_CONSENT_TEXT.marketing}
          </label>
          <p className="text-xs text-muted-foreground">
            {REPORT_CONSENT_TEXT.notice}{" "}
            <Link href="/privacy" className="underline underline-offset-4">
              Privacy notice
            </Link>
          </p>
          {captcha.enabled && <div ref={captchaBox} data-testid="turnstile" />}
          {error && (
            <p role="alert" className="text-danger-strong">
              {error}
            </p>
          )}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <Button type="submit" loading={state === "sending"}>
              Send my report
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
