// The matching tests run on a snapshot of the demo catalogue. This checks the snapshot still matches
// the database; if it fails after a seed change, run `npm run match:fixture`.
import { readFileSync } from "node:fs"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { connect } from "../../scripts/db.mjs"
import { exportCatalogue } from "../../scripts/export-demo-catalogue.mjs"

const volatile = new Set(["id", "created_at", "updated_at", "university_id", "programme_id", "embedding"])
const strip = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value, (key: string, v: unknown) => (volatile.has(key) ? undefined : v)))

describe("demo catalogue snapshot", () => {
  let db: Awaited<ReturnType<typeof connect>>
  beforeAll(async () => {
    db = await connect()
  })
  afterAll(async () => {
    await db?.end()
  })

  it("matches the seeded database", async () => {
    const live = (await exportCatalogue(db)) as Record<string, unknown[]>
    const fixture = JSON.parse(readFileSync("tests/fixtures/demo-catalogue.json", "utf8")) as Record<string, unknown[]>
    expect(Object.keys(live)).toEqual(Object.keys(fixture))
    for (const [table, rows] of Object.entries(fixture)) {
      const sortKey = (row: unknown) => JSON.stringify(strip(row))
      const sorted = (list: unknown[]) => list.map(sortKey).sort()
      expect(sorted(live[table]!), table).toEqual(sorted(rows))
    }
  })
})
