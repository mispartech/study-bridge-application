"use client"

import * as React from "react"

import { forgetHumanPass, humanPassLikely } from "@/lib/security/human-hint"

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
  /**
   * The route accepts the 30-minute pass a passed check earns (quick search, report, advisor). While it's
   * valid, nothing loads and no token is needed. Supabase sign-in can't use it, so it leaves this off.
   */
  acceptsPass?: boolean
}

/**
 * Cloudflare Turnstile. Loaded only where it is used, and only when a site key is set. Tokens are single use:
 * call reset() after each request, and nextToken() to wait for the following one.
 */
export function useTurnstile({ invisible = false, lazy = false, acceptsPass = false }: Options = {}) {
  const siteKey = turnstileSiteKey()
  // A callback ref: the widget renders once its box is on the page.
  const [box, setBox] = React.useState<HTMLDivElement | null>(null)
  const [active, setActive] = React.useState(() => !lazy && !(acceptsPass && humanPassLikely()))
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

  const start = React.useCallback(() => {
    if (!(acceptsPass && humanPassLikely())) setActive(true)
  }, [acceptsPass])

  const reset = React.useCallback(() => {
    setToken(null)
    if (widget.current) window.turnstile?.reset(widget.current)
  }, [setToken])

  /** The current token, or the next one once Cloudflare issues it. Null when off, failed or too slow. */
  const nextToken = React.useCallback((): Promise<string | null> => {
    if (!siteKey || (acceptsPass && humanPassLikely())) return Promise.resolve(null)
    setActive(true)
    if (latest.current) return Promise.resolve(latest.current)
    return new Promise((resolve) => {
      waiters.current.push(resolve)
      setTimeout(() => resolve(latest.current), TOKEN_WAIT_MS)
    })
  }, [siteKey, acceptsPass])

  /** The server refused the pass (expired, or another device): drop the hint so the next try gets a token. */
  const forget = React.useCallback(() => {
    forgetHumanPass()
    setActive(true)
  }, [])

  /**
   * Sends a protected request with a token, or with none while the pass is valid. If the server refuses the
   * pass, it fetches a token and tries once more, so an expired pass never shows the student an error.
   */
  const send = React.useCallback(
    async (request: (token: string | null) => Promise<Response | null>): Promise<Response | null> => {
      const token = await nextToken()
      const res = await request(token)
      reset() // a token works once
      if (token || res?.status !== 403) return res
      const body = (await res
        .clone()
        .json()
        .catch(() => null)) as { code?: string } | null
      if (body?.code !== "human_required") return res
      forget()
      const retry = await request(await nextToken())
      reset()
      return retry
    },
    [nextToken, reset, forget]
  )

  // Once verified, an invisible check folds away instead of leaving Cloudflare's "Success" box on screen. It
  // stays in the page (not display:none), so it can still ask again if a later token needs a tap.
  const boxClassName = invisible && token ? "h-0 overflow-hidden" : undefined

  return { enabled: siteKey !== null, token, failed, reset, start, nextToken, send, boxClassName, box: setBox }
}
