export const ALL_COUNTRIES = ["UK", "CA", "US"] as const
export type CountryCode = (typeof ALL_COUNTRIES)[number]

/** An empty selection means every country, so a student who skips the question sees everything. */
export const isSelected = (selected: readonly string[], code: string) =>
  selected.length === 0 || selected.includes(code)

/** Turning off the last country, or turning on the third, both land back on "every country". */
export function toggleCountry(selected: readonly CountryCode[], code: CountryCode): CountryCode[] {
  const current = selected.length === 0 ? [...ALL_COUNTRIES] : [...selected]
  const next = current.includes(code) ? current.filter((c) => c !== code) : [...current, code]
  return next.length === 0 || next.length === ALL_COUNTRIES.length ? [] : next
}

export const inCountries = <T extends { country: string }>(items: T[], selected: readonly string[]) =>
  items.filter((item) => isSelected(selected, item.country))
