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
