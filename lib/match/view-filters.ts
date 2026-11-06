import type { CardView } from "./present"

export type FeeBand = "any" | "under_50m" | "50m_70m" | "70m_plus"
export type SortKey = "fit" | "cost" | "deadline"

export type ViewFilters = {
  countries: string[]
  city: string
  feeBand: FeeBand
  term: string
  noGre: boolean
  coop: boolean
  scholarships: boolean
  sort: SortKey
}

export const NO_FILTERS: ViewFilters = {
  countries: [],
  city: "",
  feeBand: "any",
  term: "",
  noGre: false,
  coop: false,
  scholarships: false,
  sort: "fit",
}

const MILLION_KOBO = 100_000_000n

function inFeeBand(card: CardView, band: FeeBand) {
  const total = BigInt(card.cost.total_ngn_market)
  if (band === "under_50m") return total < 50n * MILLION_KOBO
  if (band === "50m_70m") return total >= 50n * MILLION_KOBO && total < 70n * MILLION_KOBO
  if (band === "70m_plus") return total >= 70n * MILLION_KOBO
  return true
}

/** The filter rail only narrows what ranking returned, so it never needs the server. */
export function applyViewFilters(cards: CardView[], f: ViewFilters): CardView[] {
  const kept = cards.filter(
    (c) =>
      (f.countries.length === 0 || f.countries.includes(c.country)) &&
      (!f.city || c.city === f.city) &&
      inFeeBand(c, f.feeBand) &&
      (!f.term || c.start_term === f.term) &&
      (!f.noGre || c.no_gre) &&
      (!f.coop || c.has_coop) &&
      (!f.scholarships || c.scholarships > 0)
  )
  if (f.sort === "fit") return kept
  return [...kept].sort((a, b) =>
    f.sort === "cost"
      ? Number(BigInt(a.cost.total_ngn_market) - BigInt(b.cost.total_ngn_market))
      : a.next_deadline.date.localeCompare(b.next_deadline.date)
  )
}
