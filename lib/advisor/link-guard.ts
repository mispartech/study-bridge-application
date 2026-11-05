const URL_IN_TEXT = /https?:\/\/[^\s)\]>"']+/g
const MARKDOWN_LINK = /\]\(\s*(https?:\/\/[^\s)]+)\s*\)/g
const REMOVED = "[link removed: not from our records]"

const trimmed = (url: string) => url.replace(/[.,;:!?]+$/, "")

/** Every URL a tool returned. Nothing else may reach a student. */
export const urlsIn = (value: unknown) => new Set((JSON.stringify(value).match(URL_IN_TEXT) ?? []).map(trimmed))

export function scrubLinks(text: string, known: Set<string>) {
  return text
    .replace(MARKDOWN_LINK, (whole, url: string) => (known.has(trimmed(url)) ? whole : "]"))
    .replace(URL_IN_TEXT, (url) => (known.has(trimmed(url)) ? url : REMOVED))
}

/**
 * R1 says links come only from tool results, but a prompt can't enforce that. This does, on the stream:
 * the last word is held back until it's complete, so a URL is never shown half-checked.
 */
export function linkGuard() {
  const known = new Set<string>()
  let held = ""
  return {
    allow: (value: unknown) => urlsIn(value).forEach((url) => known.add(url)),
    push(delta: string) {
      held += delta
      const end = held.search(/\s\S*$/)
      if (end < 0) return ""
      const ready = held.slice(0, end + 1)
      held = held.slice(end + 1)
      return scrubLinks(ready, known)
    },
    flush() {
      const rest = scrubLinks(held, known)
      held = ""
      return rest
    },
  }
}
