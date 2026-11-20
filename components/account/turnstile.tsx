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
const TOKEN_WAIT_MS = 15_000

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

type Options = {
  /** Shown only if Cloudflare needs the visitor to interact; otherwise nothing appears. */
  invisible?: boolean
  /** Wait for start() before loading, so pages that may never need it don't pay for the script. */
  lazy?: boolean
}

/**
 * Cloudflare Turnstile. Loaded only where it is used, and only when a site key is set. Tokens are single use:
 * call reset() after each request, and nextToken() to wait for the following one.
 */
export function useTurnstile({ invisible = false, lazy = false }: Options = {}) {
  const siteKey = turnstileSiteKey()
  // A callback ref: the widget renders once its box is on the page.
  const [box, setBox] = React.useState<HTMLDivElement | null>(null)
  const [active, setActive] = React.useState(!lazy)
  const widget = React.useRef<string | null>(null)
  const latest = React.useRef<string | null>(null)
  const waiters = React.useRef<((token: string | null) => void)[]>([])
  const [token, setTokenState] = React.useState<string | null>(null)
  const [failed, setFailed] = React.useState(false)

  const setToken = React.useCallback((value: string | null) => {
    latest.current = value
    setTokenState(value)
    if (value) {
      waiters.current.forEach((resolve) => resolve(value))
      waiters.current = []
    }
  }, [])

  React.useEffect(() => {
    if (!siteKey || !box || !active) return
    let cancelled = false
    loadScript()
      .then(() => {
        if (cancelled || !window.turnstile) return
        widget.current = window.turnstile.render(box, {
          sitekey: siteKey,
          ...(invisible && { appearance: "interaction-only" }),
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
  }, [siteKey, box, active, invisible, setToken])

  const start = React.useCallback(() => setActive(true), [])

  const reset = React.useCallback(() => {
    setToken(null)
    if (widget.current) window.turnstile?.reset(widget.current)
  }, [setToken])

  /** The current token, or the next one once Cloudflare issues it. Null when off, failed or too slow. */
  const nextToken = React.useCallback((): Promise<string | null> => {
    if (!siteKey) return Promise.resolve(null)
    setActive(true)
    if (latest.current) return Promise.resolve(latest.current)
    return new Promise((resolve) => {
      waiters.current.push(resolve)
      setTimeout(() => resolve(latest.current), TOKEN_WAIT_MS)
    })
  }, [siteKey])

  return { enabled: siteKey !== null, token, failed, reset, start, nextToken, box: setBox }
}
