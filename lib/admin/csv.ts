/** Spreadsheet apps run cells starting with these as formulas, so they are neutralised (CSV injection). */
const FORMULA = /^[=+\-@\t\r]/

function cell(value: unknown): string {
  if (value === null || value === undefined) return ""
  let text = typeof value === "object" ? JSON.stringify(value) : String(value)
  if (FORMULA.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Rows as CSV with a header line, in the order of `columns`. */
export function toCsv<T extends Record<string, unknown>>(rows: T[], columns: (keyof T & string)[]): string {
  return [columns.join(","), ...rows.map((r) => columns.map((c) => cell(r[c])).join(","))].join("\r\n") + "\r\n"
}
