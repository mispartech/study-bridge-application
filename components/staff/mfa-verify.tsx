"use client"

import { useRouter } from "next/navigation"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { supabaseBrowser } from "@/lib/auth/client"

type Setup = { factorId: string; qr: string | null; secret: string | null }

/**
 * Staff two-factor. First time: scan a QR code (or type the secret) into an authenticator app, then enter
 * a code. After that: just the code. Success raises the session to aal2, which the admin console requires.
 */
export function MfaVerify() {
  const router = useRouter()
  const [setup, setSetup] = React.useState<Setup | null>(null)
  const [code, setCode] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    async function start() {
      const mfa = supabaseBrowser().auth.mfa
      const { data, error: listError } = await mfa.listFactors()
      if (listError) return setError("Couldn't load your two-factor settings. Refresh to try again.")
      const verified = data.totp[0]
      if (verified) return !cancelled && setSetup({ factorId: verified.id, qr: null, secret: null })
      // A setup that was started and never finished can't be reused: remove it and start again.
      for (const f of data.all.filter((f) => f.status === "unverified")) await mfa.unenroll({ factorId: f.id })
      const { data: enrolled, error: enrolError } = await mfa.enroll({
        factorType: "totp",
        friendlyName: `StudyBridge ${new Date().toISOString().slice(0, 10)}`,
      })
      if (enrolError) {
        return setError(
          "Two-factor sign-in isn't switched on for this project yet. An admin needs to enable TOTP in Supabase."
        )
      }
      if (!cancelled) setSetup({ factorId: enrolled.id, qr: enrolled.totp.qr_code, secret: enrolled.totp.secret })
    }
    void start()
    return () => {
      cancelled = true
    }
  }, [])

  async function verify(event: React.FormEvent) {
    event.preventDefault()
    if (!setup) return
    setBusy(true)
    setError(null)
    const { error: verifyError } = await supabaseBrowser().auth.mfa.challengeAndVerify({
      factorId: setup.factorId,
      code: code.replace(/\s/g, ""),
    })
    setBusy(false)
    if (verifyError) return setError("That code didn't work. Codes change every 30 seconds: try the current one.")
    router.replace("/admin")
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-3">
      {setup?.qr && (
        <div className="flex flex-col gap-2 text-sm">
          <p>Scan this with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password):</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- an inline SVG data URL from Supabase */}
          <img src={setup.qr} alt="QR code for your authenticator app" className="size-48 rounded-card bg-white p-2" />
          <p className="text-muted-foreground">
            Or type this key:{" "}
            <code data-testid="totp-secret" className="font-mono break-all">
              {setup.secret}
            </code>
          </p>
        </div>
      )}
      {setup && (
        <form onSubmit={verify} className="flex flex-col gap-2 text-sm">
          <label className="flex flex-col gap-1 font-medium">
            6-digit code
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="h-11 w-full rounded-button border border-border bg-surface px-3 text-[0.9375rem] tracking-widest"
            />
          </label>
          <Button type="submit" block loading={busy}>
            Verify
          </Button>
        </form>
      )}
      {!setup && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <p role="alert" className="text-sm text-danger-strong">
          {error}
        </p>
      )}
    </div>
  )
}
