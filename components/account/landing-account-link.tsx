"use client"

import Link from "next/link"
import * as React from "react"

import { hasSession } from "@/lib/match/profile-store"

const noSubscription = () => () => undefined

/** Returning students need a way back in from the landing page: "Sign in", or "My matches" once signed in. */
export function LandingAccountLink() {
  const signedIn = React.useSyncExternalStore(noSubscription, hasSession, () => false)
  return (
    <Link
      href={signedIn ? "/discover" : "/sign-in"}
      data-testid="landing-account"
      className="flex min-h-11 items-center rounded-button px-3 text-sm font-medium hover:bg-surface-subtle"
    >
      {signedIn ? "My matches" : "Sign in"}
    </Link>
  )
}
