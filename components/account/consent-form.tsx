"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DATA_WE_STORE } from "@/lib/account/consent"
import { supabaseBrowser } from "@/lib/auth/client"
import { clearBrowserProfile, draftStore, emptyDraft, savedStore } from "@/lib/match/profile-store"

/** Sends what this browser holds to the account, then clears it from the browser. */
async function moveToAccount(accepted: boolean) {
  const draft = draftStore.get()
  const res = await fetch("/api/account/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accepted, draft: draft === emptyDraft ? null : draft, saved: savedStore.get() }),
  })
  if (res.ok) clearBrowserProfile()
  return res.ok
}

export function ConsentForm({ next, alreadyConsented }: { next: string; alreadyConsented: boolean }) {
  const router = useRouter()
  const [agreed, setAgreed] = React.useState(false)
  const [state, setState] = React.useState<"idle" | "saving" | "failed">("idle")
  const box = React.useRef<HTMLInputElement>(null)

  // On a slow connection the box can be ticked before this page finishes loading.
  React.useEffect(() => {
    if (box.current?.checked) setAgreed(true)
  }, [])

  // A returning student has already agreed: just bring over anything saved on this device.
  React.useEffect(() => {
    if (!alreadyConsented) return
    moveToAccount(false).finally(() => router.replace(next))
  }, [alreadyConsented, next, router])

  async function accept() {
    setState("saving")
    if (await moveToAccount(true)) router.replace(next)
    else setState("failed")
  }

  async function decline() {
    await supabaseBrowser().auth.signOut()
    router.replace("/")
  }

  if (alreadyConsented) return <p className="text-sm text-muted-foreground">Signing you in…</p>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold">Your data, your choice</h1>
        <p className="text-muted-foreground">
          Under the Nigeria Data Protection Act 2023, we need your consent to keep this information. Here&apos;s what we
          store and why.
        </p>
      </div>
      <Card className="gap-3">
        <dl className="flex flex-col gap-3 text-sm">
          {DATA_WE_STORE.map((item) => (
            <div key={item.what}>
              <dt className="font-medium">{item.what}</dt>
              <dd className="text-muted-foreground">{item.why}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm">
          We never sell your data. You can ask us to correct or delete it at any time. Read the full{" "}
          <Link href="/privacy" className="font-medium underline underline-offset-4">
            privacy notice
          </Link>
          .
        </p>
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
          <input
            ref={box}
            type="checkbox"
            className="size-5 shrink-0 accent-primary"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          I agree to StudyBridge storing this information
        </label>
        <Button block disabled={!agreed} loading={state === "saving"} onClick={accept}>
          Agree and continue
        </Button>
        <Button block variant="ghost" onClick={decline}>
          No thanks, sign me out
        </Button>
        {state === "failed" && (
          <p role="alert" className="text-sm text-danger-strong">
            We couldn&apos;t save that. Please try again.
          </p>
        )}
      </Card>
    </div>
  )
}
