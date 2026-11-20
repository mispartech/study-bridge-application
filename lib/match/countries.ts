export const ALL_COUNTRIES = ["UK", "CA", "US"] as const
export type CountryCode = (typeof ALL_COUNTRIES)[number]

/** Most countries a student can choose at once: enough to compare, few enough to keep results focused. */
export const MAX_COUNTRIES = 2

/** For filtering results: an empty selection means every country. */
export const isSelected = (selected: readonly string[], code: string) =>
  selected.length === 0 || selected.includes(code)

/**
 * Taps on a country card. A card is on only when the student chose it; tapping again turns it off.
 * Adding past `max` is refused (and the caller says why) rather than silently swapping a country out.
 */
export function pickCountry(
  selected: readonly CountryCode[],
  code: CountryCode,
  max: number = ALL_COUNTRIES.length
): { next: CountryCode[]; refused: boolean } {
  if (selected.includes(code)) return { next: selected.filter((c) => c !== code), refused: false }
  if (selected.length >= max) return { next: [...selected], refused: true }
  return { next: [...selected, code], refused: false }
}

export const inCountries = <T extends { country: string }>(items: T[], selected: readonly string[]) =>
  items.filter((item) => isSelected(selected, item.country))
