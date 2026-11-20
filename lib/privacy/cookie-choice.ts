import { ANALYTICS_COOKIE, clearAnalytics } from "@/lib/analytics/consent"

/**
 * The visitor's cookie choice. "all": answers are saved on this device (even when signed out) and anonymous
 * usage is counted. "essential": only what sign-in and security need; answers last for this visit only.
 */
export type CookieChoice = "all" | "essential"

export const COOKIE_CHOICE = "sb-cookies"
const ONE_YEAR = 60 * 60 * 24 * 365

const listeners = new Set<() => void>()

export function readCookieChoice(): CookieChoice | null {
  if (typeof document === "undefined") return null
  const value = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${COOKIE_CHOICE}=`))
    ?.split("=")[1]
  return value === "all" || value === "essential" ? value : null
}

/** Saving to this device needs "all". Until a choice is made, nothing outlives the visit. */
export const persistOnDevice = () => readCookieChoice() === "all"

/** Where answers are kept: this device for "all", this browser tab's session otherwise. */
export function answerStorage(): Storage | null {
  try {
    return persistOnDevice() ? localStorage : sessionStorage
  } catch {
    return null
  }
}

/** Cookie attributes for the answers cookies: kept a year with "all", a session cookie otherwise. */
export const answerCookieAge = () => (persistOnDevice() ? `; max-age=${ONE_YEAR}` : "")

const MOVED_KEYS = ["sb-draft", "sb-saved"]

/** Records the choice and moves anything already entered to match it, so nothing typed is lost. */
export function setCookieChoice(choice: CookieChoice) {
  document.cookie = `${COOKIE_CHOICE}=${choice}; path=/; max-age=${ONE_YEAR}; samesite=lax`
  try {
    const [from, to] = choice === "all" ? [sessionStorage, localStorage] : [localStorage, sessionStorage]
    for (const key of MOVED_KEYS) {
      const value = from.getItem(key)
      if (value !== null) {
        to.setItem(key, value)
        from.removeItem(key)
      }
    }
  } catch {
    // Storage refused (private window): the choice still applies from now on.
  }
  if (choice === "all") {
    document.cookie = `${ANALYTICS_COOKIE}=1; path=/; max-age=${ONE_YEAR}; samesite=lax`
  } else {
    clearAnalytics()
  }
  listeners.forEach((l) => l())
}

/** For components that show the choice (banner, saved note). */
export const cookieChoiceStore = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  get: readCookieChoice,
  getServer: (): CookieChoice | null => "all", // the server never shows the banner; the client decides
}
