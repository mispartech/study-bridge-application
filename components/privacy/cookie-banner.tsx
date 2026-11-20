"use client"

import Link from "next/link"
import * as React from "react"

import { Button } from "@/components/ui/button"
import { cookieChoiceStore, setCookieChoice } from "@/lib/privacy/cookie-choice"

/**
 * Asks once. "Allow" saves answers to this device (even when signed out) and counts visits anonymously;
 * "Essential only" keeps just what sign-in and security need, so answers last for this visit only.
 */
export function CookieBanner() {
  const choice = React.useSyncExternalStore(
    cookieChoiceStore.subscribe,
    cookieChoiceStore.get,
    cookieChoiceStore.getServer
  )
  if (choice !== null) return null
  return (
    <div
      role="region"
      aria-label="Cookie choice"
      data-testid="cookie-banner"
      className="fixed inset-x-2 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-lg rounded-card border border-border bg-surface p-4 shadow-lg md:bottom-4"
    >
      <p className="text-sm font-semibold">Save your answers on this device?</p>
      <p className="mt-1 text-sm text-muted-foreground">
        With cookies allowed, your answers are saved to this device automatically, even when you&apos;re signed out, and
        we count visits anonymously to improve StudyBridge. Essential cookies only keep you signed in and safe.{" "}
        <Link href="/privacy" className="underline underline-offset-4">
          Privacy notice
        </Link>
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => setCookieChoice("essential")}>
          Essential only
        </Button>
        <Button onClick={() => setCookieChoice("all")}>Allow</Button>
      </div>
    </div>
  )
}

/** Tells the student where their answers are kept, in line with their choice, with a way to change it. */
export function SavedNote() {
  const choice = React.useSyncExternalStore(cookieChoiceStore.subscribe, cookieChoiceStore.get, () => null)
  if (choice === "all") {
    return (
      <p data-testid="saved-note" className="text-center text-xs text-muted-foreground">
        Your answers are saved to this device automatically, even when you&apos;re signed out.
      </p>
    )
  }
  return (
    <p data-testid="saved-note" className="text-center text-xs text-muted-foreground">
      Your answers are kept for this visit only.{" "}
      <button
        type="button"
        className="font-medium text-primary-strong underline underline-offset-4"
        onClick={() => setCookieChoice("all")}
      >
        Allow cookies
      </button>{" "}
      to save them on this device.
    </p>
  )
}
