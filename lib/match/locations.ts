import { ALL_COUNTRIES, type CountryCode } from "./countries"
import type { Catalogue } from "./types"

/** A province, state or nation, and the cities in it where at least one listed programme is taught. */
export type Region = { region: string; cities: string[] }
export type Locations = Partial<Record<CountryCode, Region[]>>

const byName = (a: string, b: string) => a.localeCompare(b, "en")

/**
 * Where students can actually study, from the universities in the catalogue that list programmes. The
 * picker offers only these, so a chosen city always means something to the match.
 */
export function locationsFor(catalogue: Catalogue, countries: readonly CountryCode[]): Locations {
  const teaching = new Set(catalogue.programmes.map((p) => p.university_id))
  const out: Locations = {}
  for (const country of countries) {
    const regions = new Map<string, Set<string>>()
    for (const u of catalogue.universities) {
      if (u.country !== country || !teaching.has(u.id)) continue
      const cities = regions.get(u.region) ?? new Set<string>()
      cities.add(u.city)
      regions.set(u.region, cities)
    }
    out[country] = [...regions.entries()]
      .sort(([a], [b]) => byName(a, b))
      .map(([region, cities]) => ({ region, cities: [...cities].sort(byName) }))
  }
  return out
}

export const isCountry = (value: string): value is CountryCode => (ALL_COUNTRIES as readonly string[]).includes(value)
