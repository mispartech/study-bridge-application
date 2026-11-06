const URL_IN_TEXT = /https?:\/\/[^\s)\]>"']+/g
const MARKDOWN_LINK = /\]\(\s*(https?:\/\/[^\s)]+)\s*\)/g
const REMOVED = "[link removed: not from our records]"

const trimmed = (url: string) => url.replace(/[.,;:!?]+$/, "")

/** Every URL a tool returned. Nothing else may reach a student. */
export const urlsIn = (value: unknown) => new Set((JSON.stringify(value).match(URL_IN_TEXT) ?? []).map(trimmed))

/** R1 says links come only from tool results, but a prompt can't enforce that. This does. */
export function scrubLinks(text: string, known: Set<string>) {
  return text
    .replace(MARKDOWN_LINK, (whole, url: string) => (known.has(trimmed(url)) ? whole : "]"))
    .replace(URL_IN_TEXT, (url) => (known.has(trimmed(url)) ? url : REMOVED))
}
