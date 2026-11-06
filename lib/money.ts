export const CURRENCIES = ["NGN", "GBP", "CAD", "USD"] as const
export type Currency = (typeof CURRENCIES)[number]

/** Minor units per major unit (kobo, pence, cents) — all four currencies use 2 decimals. */
const MINOR_DIGITS: Record<Currency, number> = { NGN: 2, GBP: 2, CAD: 2, USD: 2 }

// en-NG gives "₦" for NGN; the others use their home locale so symbols read naturally
// (en-CA shows "$" for CAD, so we force a code display there to avoid confusion with USD).
const LOCALE: Record<Currency, string> = { NGN: "en-NG", GBP: "en-GB", CAD: "en-CA", USD: "en-US" }

export type FormatMoneyOptions = {
  /**
   * "auto" hides the fraction when it is zero (₦4,500,000 rather than ₦4,500,000.00);
   * "always" shows it; "never" rounds half-away-from-zero to whole units.
   */
  fraction?: "auto" | "always" | "never"
  /** Compact notation for tight UI, e.g. ₦4.5M. Always rounds. */
  compact?: boolean
}

const SHORT_SYMBOL: Record<Currency, string> = { NGN: "₦", GBP: "£", CAD: "CA$", USD: "US$" }

/** One short form for the UI and for R2, so explanations read the same as the screen: ₦59.4m, £34.8k, CA$900. */
export function formatShort(amountMinor: bigint | number, currency: Currency): string {
  const minor = BigInt(amountMinor)
  const negative = minor < 0n
  const major = Number(negative ? -minor : minor) / 10 ** MINOR_DIGITS[currency]
  const oneDecimal = (n: number) => (Math.round(n * 10) / 10).toString()
  let text = Math.round(major).toLocaleString("en-GB")
  if (major >= 999_950) text = `${oneDecimal(major / 1_000_000)}m`
  else if (major >= 1000) text = `${oneDecimal(major / 1000)}k`
  return `${negative ? "-" : ""}${SHORT_SYMBOL[currency]}${text}`
}

export type FxRates = Partial<Record<Currency, number>>

const RATE_SCALE = 10_000n

/** Converts through NGN with rates from the database (NGN per one unit), keeping integer arithmetic. */
export function convertMinor(amountMinor: bigint, from: Currency, to: Currency, ngnPerUnit: FxRates): bigint | null {
  if (from === to) return amountMinor
  const rate = (currency: Currency) => {
    if (currency === "NGN") return RATE_SCALE
    const value = ngnPerUnit[currency]
    return value ? BigInt(Math.round(value * Number(RATE_SCALE))) : null
  }
  const [fromRate, toRate] = [rate(from), rate(to)]
  if (fromRate === null || toRate === null) return null
  return (amountMinor * fromRate + toRate / 2n) / toRate
}

/**
 * Formats an integer amount in minor units. Works on bigint so large NGN amounts in kobo
 * never lose precision through floating point.
 */
export function formatMoney(
  amountMinor: bigint | number,
  currency: Currency,
  options: FormatMoneyOptions = {}
): string {
  const { fraction = "auto", compact = false } = options
  if (typeof amountMinor === "number" && !Number.isSafeInteger(amountMinor)) {
    throw new TypeError(`formatMoney expects an integer amount in minor units, got ${amountMinor}`)
  }

  const digits = MINOR_DIGITS[currency]
  const scale = 10n ** BigInt(digits)
  const minor = BigInt(amountMinor)
  const negative = minor < 0n
  const abs = negative ? -minor : minor
  let major = abs / scale
  const rest = abs % scale

  const showFraction = !compact && (fraction === "always" || (fraction === "auto" && rest !== 0n))
  if (!showFraction && rest * 2n >= scale) major += 1n // round half away from zero

  const decimal = `${negative ? "-" : ""}${major}${showFraction ? `.${rest.toString().padStart(digits, "0")}` : ""}`

  const formatter = new Intl.NumberFormat(LOCALE[currency], {
    style: "currency",
    currency,
    currencyDisplay: currency === "CAD" ? "code" : "symbol",
    notation: compact ? "compact" : "standard",
    minimumFractionDigits: showFraction ? digits : 0,
    maximumFractionDigits: showFraction ? digits : compact ? 1 : 0,
  })

  // Intl formats decimal strings exactly (no float conversion), which keeps bigint precision.
  return formatter.format(decimal as unknown as number)
}
