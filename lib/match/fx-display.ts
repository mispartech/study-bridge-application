// Business rule from the product owner: when the official and market naira totals are within 3% of
// each other, one figure plus a buffer is clearer than two near-identical numbers.
export const FX_CLOSE_PERCENT = 3

type Totals = { total_ngn_market: string; total_ngn_official: string }

export function fxClose({ total_ngn_market, total_ngn_official }: Totals) {
  const market = BigInt(total_ngn_market)
  const official = BigInt(total_ngn_official)
  if (official === 0n) return false
  const gap = market > official ? market - official : official - market
  return gap * 100n < official * BigInt(FX_CLOSE_PERCENT)
}

/** The buffer on the figure shown (the market total), rounded to the nearest naira. */
export const fxBuffer = ({ total_ngn_market }: Totals) =>
  (BigInt(total_ngn_market) * BigInt(FX_CLOSE_PERCENT) + 50n) / 100n
