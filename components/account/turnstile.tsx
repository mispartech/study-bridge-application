"use client"

import * as React from "react"

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string
      reset: (id: string) => void
      remove: (id: string) => void
    }
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

let loading: Promise<void> | null = null
function loadScript() {
  loading ??= new Promise((resolve, reject) => {
    const tag = document.createElement("script")
    tag.src = SCRIPT
    tag.async = true
    tag.onload = () => resolve()
    tag.onerror = () => reject(new Error("Turnstile didn't load"))
    document.head.appendChild(tag)
  })
  return loading
}

export const turnstileSiteKey = () => process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || null

/**
 * Cloudflare Turnstile, which Supabase checks before sending a sign-in link. Loaded only on the sign-in
 * page, and only when a site key is set. Tokens are single use, so `reset` is called after every attempt.
 */
export function useTurnstile() {
  const siteKey = turnstileSiteKey()
  const box = React.useRef<HTMLDivElement>(null)
  const widget = React.useRef<string | null>(null)
  const [token, setToken] = React.useState<string | null>(null)
  const [failed, setFailed] = React.useState(false)

  React.useEffect(() => {
    if (!siteKey || !box.current) return
    let cancelled = false
    loadScript()
      .then(() => {
        if (cancelled || !box.current || !window.turnstile) return
        widget.current = window.turnstile.render(box.current, {
          sitekey: siteKey,
          callback: (value: string) => setToken(value),
          "expired-callback": () => setToken(null),
          "error-callback": () => setFailed(true),
        })
      })
      .catch(() => setFailed(true))
    return () => {
      cancelled = true
      if (widget.current) window.turnstile?.remove(widget.current)
      widget.current = null
    }
  }, [siteKey])

  const reset = React.useCallback(() => {
    setToken(null)
    if (widget.current) window.turnstile?.reset(widget.current)
  }, [])

  return { enabled: siteKey !== null, token, failed, reset, box }
}
