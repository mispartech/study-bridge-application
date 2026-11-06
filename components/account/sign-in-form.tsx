"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { supabaseBrowser } from "@/lib/auth/client"

const REASONS: Record<string, { title: string; body: string }> = {
  save: { title: "Save this programme", body: "Create a free account to keep your shortlist on any device." },
  advisor: { title: "Talk to the advisor", body: "Create a free account to ask about programmes, costs and visas." },
  wizard: {
    title: "Keep your profile",
    body: "Create a free account so your answers are saved and your matches stay yours.",
  },
}
const DEFAULT_REASON = { title: "Sign in to StudyBridge", body: "New here? This creates your free account." }

export function SignInForm() {
  const params = useSearchParams()
  const reason = REASONS[params.get("reason") ?? ""] ?? DEFAULT_REASON
  const next = params.get("next") ?? "/discover"
  const [email, setEmail] = React.useState("")
  const [state, setState] = React.useState<"idle" | "sending" | "sent" | "failed">("idle")
  const callback = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`

  async function sendLink(event: React.FormEvent) {
    event.preventDefault()
    setState("sending")
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callback() },
    })
    setState(error ? "failed" : "sent")
  }

  async function google() {
    const { error } = await supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback() },
    })
    if (error) setState("failed")
  }

  if (state === "sent") {
    return (
      <Card className="gap-2" data-testid="link-sent">
        <h1 className="text-2xl font-extrabold">Check your email</h1>
        <p className="text-sm text-muted-foreground">
          We sent a sign-in link to {email}. Open it on this phone and you&apos;ll come straight back.
        </p>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold">{reason.title}</h1>
        <p className="text-muted-foreground">{reason.body}</p>
      </div>
      {params.get("error") === "link" && (
        <p role="alert" className="text-sm text-danger-strong">
          That link has expired or was already used. Ask for a new one below.
        </p>
      )}
      <Card className="gap-3">
        <form onSubmit={sendLink} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Email address
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 w-full rounded-button border border-border bg-surface px-3 text-[0.9375rem]"
            />
          </label>
          <Button type="submit" block loading={state === "sending"}>
            Email me a sign-in link
          </Button>
        </form>
        <p className="text-center text-xs text-muted-foreground">or</p>
        <Button variant="outline" block onClick={google}>
          Continue with Google
        </Button>
        {state === "failed" && (
          <p role="alert" className="text-sm text-danger-strong">
            We couldn&apos;t do that just now. Check your email address and try again.
          </p>
        )}
      </Card>
      {params.get("reason") === "wizard" && (
        <p className="text-center text-sm">
          <Link href="/discover" className="font-medium underline underline-offset-4">
            See my matches first
          </Link>
        </p>
      )}
      <p className="text-center text-xs text-muted-foreground">
        We explain what we store on the next screen. Read our{" "}
        <Link href="/privacy" className="underline underline-offset-4">
          privacy notice
        </Link>
        .
      </p>
    </div>
  )
}
