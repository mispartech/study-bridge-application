// Application portals accepted for any university (docs/EXTRACTION.md section 4).
const PORTALS = ["ucas.com", "ouac.on.ca"]

/** Apply links must be https and on the university's allow-listed domains or an accepted portal. */
export function isOfficialUrl(url: string | null | undefined, officialDomains: readonly string[]): boolean {
  if (!url) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== "https:") return false
  const host = parsed.hostname.toLowerCase()
  return [...officialDomains, ...PORTALS].some((domain) => {
    const allowed = domain.toLowerCase().replace(/^\./, "")
    return host === allowed || host.endsWith(`.${allowed}`)
  })
}
