// Finds the money, dates and percentages in an answer and checks each against the evidence: tool results
// and the student's own messages. Used by the number guard at runtime and by the eval grader.

const MONEY =
  /(?:₦|NGN\s?|£|GBP\s?|CA\$|C\$|CAD\s?\$?|US\$|USD\s?\$?|\$)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:million|thousand|m\b|k\b))?/gi
const PERCENT = /(\d+(?:\.\d+)?)\s?(?:%|percent\b)/gi

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
const MONTH =
  "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?"
const DAY = "(\\d{1,2})(?:st|nd|rd|th)?"

type Money = { currency: string; value: number; unit: number }
type FoundDate = { year?: number; month: number; day?: number }

function parseMoney(raw: string): Money {
  const text = raw.toLowerCase().replace(/\s/g, "")
  const currency = /^(₦|ngn)/.test(text)
    ? "NGN"
    : /^(£|gbp)/.test(text)
      ? "GBP"
      : /^(ca\$|c\$|cad)/.test(text)
        ? "CAD"
        : /^(us\$|usd)/.test(text)
          ? "USD"
          : "$"
  const digits = text.match(/\d[\d,]*(?:\.\d+)?/)![0].replace(/,/g, "")
  const scale = /(million|m)$/.test(text) ? 1_000_000 : /(thousand|k)$/.test(text) ? 1000 : 1
  const decimals = digits.split(".")[1]?.length ?? 0
  return { currency, value: Number(digits) * scale, unit: scale / 10 ** decimals }
}

const roundsTo = (value: number, target: number, unit: number) =>
  Math.abs(Math.round(value / unit) * unit - target) < unit / 1000

function sameMoney(a: Money, b: Money) {
  const currency = a.currency === b.currency || (a.currency === "$" && b.currency !== "NGN" && b.currency !== "GBP")
  if (!currency) return false
  // Either figure may be the rounded form of the other: £34,800 and £34.8k, or £1,171 and £1.2k.
  return roundsTo(b.value, a.value, a.unit) || roundsTo(a.value, b.value, b.unit)
}

const monthNumber = (name: string) => MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1

function datesIn(source: string): FoundDate[] {
  let text = source
  const found: FoundDate[] = []
  const take = (pattern: RegExp, read: (m: RegExpExecArray) => FoundDate) => {
    text = text.replace(pattern, (...args) => {
      found.push(read(args.slice(0, -2) as unknown as RegExpExecArray))
      return " "
    })
  }
  take(/\b(\d{4})-(\d{2})-(\d{2})/g, (m) => ({ year: +m[1]!, month: +m[2]!, day: +m[3]! }))
  take(/\b(\d{4})-(\d{2})\b/g, (m) => ({ year: +m[1]!, month: +m[2]! }))
  take(new RegExp(`\\b${DAY}\\s+(?:of\\s+)?${MONTH},?\\s+(\\d{4})\\b`, "gi"), (m) => ({
    day: +m[1]!,
    month: monthNumber(m[2]!),
    year: +m[3]!,
  }))
  take(new RegExp(`\\b${MONTH}\\s+${DAY},?\\s+(\\d{4})\\b`, "gi"), (m) => ({
    month: monthNumber(m[1]!),
    day: +m[2]!,
    year: +m[3]!,
  }))
  take(new RegExp(`\\b${MONTH},?\\s+(\\d{4})\\b`, "gi"), (m) => ({ month: monthNumber(m[1]!), year: +m[2]! }))
  take(new RegExp(`\\b${DAY}\\s+(?:of\\s+)?${MONTH}\\b`, "gi"), (m) => ({ day: +m[1]!, month: monthNumber(m[2]!) }))
  take(new RegExp(`\\b${MONTH}\\s+${DAY}\\b`, "gi"), (m) => ({ month: monthNumber(m[1]!), day: +m[2]! }))
  return found
}

/** Every part the answer states must match; "January 2027" is backed by any date in that month. */
const sameDate = (stated: FoundDate, known: FoundDate) =>
  stated.month === known.month &&
  (stated.year === undefined || known.year === undefined || stated.year === known.year) &&
  (stated.day === undefined || stated.day === known.day)

const describeDate = (d: FoundDate) => [d.day, MONTHS[d.month - 1], d.year].filter(Boolean).join(" ")

/** The figures in `answer` that nothing in `evidence` supports. */
export function uncheckedFigures(answer: string, evidence: string[]): string[] {
  const source = evidence.join("\n")
  const knownMoney = (source.match(MONEY) ?? []).map(parseMoney)
  const knownDates = datesIn(source)
  const knownPercents = new Set([...source.matchAll(PERCENT)].map((m) => Number(m[1])))

  const money = (answer.match(MONEY) ?? [])
    .filter((raw) => !knownMoney.some((known) => sameMoney(parseMoney(raw), known)))
    .map((raw) => raw.trim())
  const dates = datesIn(answer)
    .filter((date) => !knownDates.some((known) => sameDate(date, known)))
    .map(describeDate)
  const percents = [...answer.matchAll(PERCENT)].filter((m) => !knownPercents.has(Number(m[1]))).map((m) => m[0])
  return [...new Set([...money, ...dates, ...percents])]
}
