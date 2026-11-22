/** Shared by the server pass and the page. The hint is only a hint: the server checks the signed pass. */
export const HUMAN_HINT_COOKIE = "sb-human-until"
export const HUMAN_PASS_MS = 30 * 60 * 1000

/** In the browser: true while a pass is probably still valid (with a minute's margin for clock drift). */
export function humanPassLikely(now = Date.now()): boolean {
  if (typeof document === "undefined") return false
  const value = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${HUMAN_HINT_COOKIE}=`))
    ?.split("=")[1]
  return Number(value) - 60_000 > now
}

/** Forgets the hint after the server refused the pass, so the next attempt fetches a token. */
export function forgetHumanPass() {
  if (typeof document !== "undefined") document.cookie = `${HUMAN_HINT_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
}
