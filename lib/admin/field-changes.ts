/**
 * The fields a reviewer changed between what the extractor proposed and what they approved, as paths like
 * "fees[0].tuition_amount". Array items are compared by position, which matches how the editor shows them.
 */
export function changedFields(proposed: unknown, approved: unknown, path = ""): string[] {
  if (Object.is(proposed, approved)) return []
  const bothObjects = isObject(proposed) && isObject(approved)
  const bothArrays = Array.isArray(proposed) && Array.isArray(approved)
  if (bothArrays) {
    const length = Math.max(proposed.length, approved.length)
    return Array.from({ length }, (_, i) => changedFields(proposed[i], approved[i], `${path}[${i}]`)).flat()
  }
  if (bothObjects) {
    const keys = new Set([...Object.keys(proposed), ...Object.keys(approved)])
    return [...keys].flatMap((key) => changedFields(proposed[key], approved[key], path ? `${path}.${key}` : key))
  }
  // An absent value and null mean the same thing in a record.
  if ((proposed ?? null) === (approved ?? null)) return []
  return [path || "(record)"]
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** "fees[0].tuition_amount" and "fees[1].tuition_amount" count as the same field in the stats. */
export const fieldName = (path: string) => path.replace(/\[\d+\]/g, "[]")

export function fieldChangeStats(rows: { field_changes: string[] | null }[]) {
  const reviewed = rows.length
  const counts = new Map<string, number>()
  for (const row of rows) {
    for (const field of new Set((row.field_changes ?? []).map(fieldName))) {
      counts.set(field, (counts.get(field) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([field, changed]) => ({ field, changed, rate: reviewed ? changed / reviewed : 0 }))
    .sort((a, b) => b.changed - a.changed || a.field.localeCompare(b.field))
}
