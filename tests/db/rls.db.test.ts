// RLS tests against the real Supabase database (npm run test:db).
//
// Each test runs in a transaction that is rolled back, so the throwaway auth users and rows
// it creates never persist. Inside the transaction we switch to the `anon` / `authenticated`
// roles with JWT claims exactly as PostgREST does for real requests.

import { randomUUID } from "node:crypto"

import type pg from "pg"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { connect } from "../../scripts/db.mjs"
import { rowSchemas } from "../../lib/db/schemas"

let db: pg.Client

beforeAll(async () => {
  db = await connect()
})
afterAll(async () => {
  await db?.end()
})
beforeEach(async () => {
  await db.query("begin")
})
afterEach(async () => {
  await db.query("rollback")
})

type Role = "anon" | "authenticated" | "service_role"

/** Run `fn` as a client role (optionally as a signed-in user), then return to the owner role. */
async function as<T>(role: Role, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query("savepoint as_role")
  try {
    await db.query(`set local role ${role}`)
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify(userId ? { sub: userId, role } : { role }),
    ])
    const result = await fn()
    await db.query("release savepoint as_role")
    return result
  } catch (err) {
    await db.query("rollback to savepoint as_role")
    throw err
  } finally {
    await db.query("reset role")
  }
}

/** Expect the statement to be refused; returns the Postgres error code. */
async function refused(role: Role, userId: string | null, sql: string, params: unknown[] = []) {
  const err = await as(role, userId, () => db.query(sql, params)).then(
    () => null,
    (e: { code?: string }) => e
  )
  expect(err, `expected refusal for ${role}: ${sql}`).not.toBeNull()
  return err!.code
}

const rows = (role: Role, userId: string | null, sql: string, params: unknown[] = []) =>
  as(role, userId, () => db.query(sql, params)).then((r) => r.rows)

/** Creates an auth user plus student_profile (as the table owner); returns their ids. */
async function student() {
  const userId = randomUUID()
  await db.query(
    `insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
     values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, now(), now())`,
    [userId, `rls-test-${userId}@example.com`]
  )
  const { rows } = await db.query(
    "insert into public.student_profile (user_id, nationality, field) values ($1, 'NG', 'law') returning id",
    [userId]
  )
  return { userId, studentId: rows[0].id as string }
}

async function anyProgrammeIds(n: number): Promise<string[]> {
  const { rows } = await db.query("select id from public.programme order by title limit $1", [n])
  return rows.map((r) => r.id)
}

const CONTENT_TABLES = [
  "university",
  "programme",
  "requirement",
  "intake",
  "fee",
  "city_cost",
  "scholarship",
  "visa_rule",
  "grade_mapping",
  "fx_rate",
] as const

// ---------------------------------------------------------------------------------

describe("content tables: read-only to clients", () => {
  it.each(CONTENT_TABLES)("%s is readable by anon and authenticated", async (table) => {
    const { count } = (await db.query(`select count(*)::int as count from public.${table}`)).rows[0]
    for (const role of ["anon", "authenticated"] as const) {
      const r = await rows(
        role,
        role === "authenticated" ? randomUUID() : null,
        `select count(*)::int as count from public.${table}`
      )
      expect(r[0].count, `${role} sees all ${table} rows`).toBe(count)
    }
  })

  it.each(CONTENT_TABLES)("%s rejects insert, update and delete from anon and authenticated", async (table) => {
    for (const role of ["anon", "authenticated"] as const) {
      const user = role === "authenticated" ? randomUUID() : null
      expect(await refused(role, user, `insert into public.${table} default values`)).toBe("42501")
      expect(await refused(role, user, `update public.${table} set updated_at = now()`)).toBe("42501")
      expect(await refused(role, user, `delete from public.${table}`)).toBe("42501")
    }
  })

  it("service_role can write content", async () => {
    const r = await rows("service_role", null, "update public.grade_mapping set updated_at = now() returning id")
    expect(r.length).toBeGreaterThan(0)
  })
})

describe("ingestion tables: service_role only", () => {
  it.each(["source_audit", "review_queue"])("%s is invisible and unwritable to clients", async (table) => {
    for (const role of ["anon", "authenticated"] as const) {
      const user = role === "authenticated" ? randomUUID() : null
      expect(await refused(role, user, `select * from public.${table}`)).toBe("42501")
      expect(await refused(role, user, `insert into public.${table} default values`)).toBe("42501")
    }
  })

  it("service_role can write review_queue", async () => {
    const r = await rows(
      "service_role",
      null,
      "insert into public.review_queue (table_name, proposed, reason) values ('fee', '{}', 'test') returning id"
    )
    expect(r).toHaveLength(1)
  })
})

describe("student_profile: owner only", () => {
  it("anon can neither read nor create profiles", async () => {
    await student()
    expect(await refused("anon", null, "select * from public.student_profile")).toBe("42501")
    expect(
      await refused("anon", null, "insert into public.student_profile (user_id) values ($1)", [randomUUID()])
    ).toBe("42501")
  })

  it("a student sees and edits only their own profile", async () => {
    const a = await student()
    const b = await student()

    const visible = await rows("authenticated", a.userId, "select id from public.student_profile")
    expect(visible.map((r) => r.id)).toEqual([a.studentId])

    const updated = await rows("authenticated", a.userId, "update public.student_profile set ielts = 7.5 returning id")
    expect(updated.map((r) => r.id)).toEqual([a.studentId])

    // Updates and deletes aimed at B silently match nothing.
    const hitB = await rows(
      "authenticated",
      a.userId,
      "update public.student_profile set ielts = 4 where id = $1 returning id",
      [b.studentId]
    )
    expect(hitB).toHaveLength(0)
    const delB = await rows(
      "authenticated",
      a.userId,
      "delete from public.student_profile where id = $1 returning id",
      [b.studentId]
    )
    expect(delB).toHaveLength(0)
    const { rows: bAfter } = await db.query("select ielts from public.student_profile where id = $1", [b.studentId])
    expect(bAfter[0].ielts).toBeNull()
  })

  it("a student cannot create a profile for someone else or move theirs to another user", async () => {
    const a = await student()
    const b = await student()
    const other = randomUUID()
    expect(
      await refused("authenticated", other, "insert into public.student_profile (user_id) values ($1)", [b.userId])
    ).toBe("42501")
    expect(
      await refused("authenticated", a.userId, "update public.student_profile set user_id = $1 where id = $2", [
        b.userId,
        a.studentId,
      ])
    ).toBe("42501")
  })

  it("a new user can create exactly their own profile", async () => {
    const userId = randomUUID()
    await db.query(
      `insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at)
       values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2, now(), now())`,
      [userId, `rls-test-${userId}@example.com`]
    )
    const r = await rows(
      "authenticated",
      userId,
      "insert into public.student_profile (user_id) values ($1) returning user_id",
      [userId]
    )
    expect(r[0].user_id).toBe(userId)
  })
})

describe.each(["shortlist", "application_tracker"] as const)("%s: owner only", (table) => {
  it("anon has no access", async () => {
    expect(await refused("anon", null, `select * from public.${table}`)).toBe("42501")
  })

  it("a student can add, read, update and remove their own rows", async () => {
    const a = await student()
    const [p1] = await anyProgrammeIds(1)
    const ins = await rows(
      "authenticated",
      a.userId,
      `insert into public.${table} (student_id, programme_id) values ($1, $2) returning id`,
      [a.studentId, p1]
    )
    expect(ins).toHaveLength(1)
    expect(await rows("authenticated", a.userId, `select id from public.${table}`)).toHaveLength(1)
    expect(
      await rows("authenticated", a.userId, `update public.${table} set updated_at = now() returning id`)
    ).toHaveLength(1)
    expect(await rows("authenticated", a.userId, `delete from public.${table} returning id`)).toHaveLength(1)
  })

  it("students cannot see, change or remove each other's rows", async () => {
    const a = await student()
    const b = await student()
    const [p1, p2] = await anyProgrammeIds(2)
    await db.query(`insert into public.${table} (student_id, programme_id) values ($1, $2), ($3, $4)`, [
      a.studentId,
      p1,
      b.studentId,
      p2,
    ])

    const seenByA = await rows("authenticated", a.userId, `select student_id from public.${table}`)
    expect(seenByA.map((r) => r.student_id)).toEqual([a.studentId])
    expect(
      await rows(
        "authenticated",
        a.userId,
        `update public.${table} set updated_at = now() where student_id = $1 returning id`,
        [b.studentId]
      )
    ).toHaveLength(0)
    expect(
      await rows("authenticated", a.userId, `delete from public.${table} where student_id = $1 returning id`, [
        b.studentId,
      ])
    ).toHaveLength(0)
    const { rows: stillThere } = await db.query(`select count(*)::int c from public.${table} where student_id = $1`, [
      b.studentId,
    ])
    expect(stillThere[0].c).toBe(1)
  })

  it("a student cannot insert rows under another student's id or reassign their own", async () => {
    const a = await student()
    const b = await student()
    const [p1, p2] = await anyProgrammeIds(2)
    expect(
      await refused(
        "authenticated",
        a.userId,
        `insert into public.${table} (student_id, programme_id) values ($1, $2)`,
        [b.studentId, p1]
      )
    ).toBe("42501")

    await db.query(`insert into public.${table} (student_id, programme_id) values ($1, $2)`, [a.studentId, p2])
    expect(await refused("authenticated", a.userId, `update public.${table} set student_id = $1`, [b.studentId])).toBe(
      "42501"
    )
  })

  it("a signed-in user without a profile sees nothing and cannot insert", async () => {
    const a = await student()
    const [p1] = await anyProgrammeIds(1)
    await db.query(`insert into public.${table} (student_id, programme_id) values ($1, $2)`, [a.studentId, p1])
    const stranger = randomUUID()
    expect(await rows("authenticated", stranger, `select * from public.${table}`)).toHaveLength(0)
    expect(
      await refused(
        "authenticated",
        stranger,
        `insert into public.${table} (student_id, programme_id) values ($1, $2)`,
        [a.studentId, p1]
      )
    ).toBe("42501")
  })
})

describe("data integrity", () => {
  it("rejects an apply_url outside the university's official domains", async () => {
    const { rows: p } = await db.query("select id from public.programme limit 1")
    await db.query("savepoint s")
    const err = await db
      .query("update public.programme set apply_url = 'https://evil.example.com/apply' where id = $1", [p[0].id])
      .then(
        () => null,
        (e) => e
      )
    await db.query("rollback to savepoint s")
    expect(err?.code).toBe("23514")
  })

  it("rejects http (non-https) apply links and lookalike domains", async () => {
    const { rows: p } = await db.query(
      "select p.id, u.official_domains[1] as domain from public.programme p join public.university u on u.id = p.university_id limit 1"
    )
    for (const url of [
      `http://${p[0].domain}/apply`,
      `https://${p[0].domain}.attacker.test/apply`,
      `https://not${p[0].domain}/apply`,
    ]) {
      await db.query("savepoint s")
      const err = await db.query("update public.programme set apply_url = $1 where id = $2", [url, p[0].id]).then(
        () => null,
        (e) => e
      )
      await db.query("rollback to savepoint s")
      expect(err?.code, url).toBe("23514")
    }
  })

  it("blocks narrowing official_domains when apply links would be orphaned", async () => {
    await db.query("savepoint s")
    const err = await db
      .query("update public.university set official_domains = '{elsewhere.example}' where is_demo")
      .then(
        () => null,
        (e) => e
      )
    await db.query("rollback to savepoint s")
    expect(err?.code).toBe("23514")
  })

  it("one shortlist entry per student per programme", async () => {
    const a = await student()
    const [p1] = await anyProgrammeIds(1)
    await db.query("insert into public.shortlist (student_id, programme_id) values ($1, $2)", [a.studentId, p1])
    await db.query("savepoint s")
    const err = await db
      .query("insert into public.shortlist (student_id, programme_id) values ($1, $2)", [a.studentId, p1])
      .then(
        () => null,
        (e) => e
      )
    await db.query("rollback to savepoint s")
    expect(err?.code).toBe("23505")
  })
})

describe("seed data through the public API (anon key, PostgREST)", () => {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
  const get = (path: string) =>
    fetch(`${base}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })

  it.each([
    "university",
    "programme",
    "requirement",
    "intake",
    "fee",
    "city_cost",
    "visa_rule",
    "grade_mapping",
  ] as const)("%s rows match their Zod schema", async (table) => {
    const res = await get(`${table}?select=*${table === "programme" ? "" : ""}&limit=1000`)
    expect(res.status).toBe(200)
    const data = (await res.json()) as unknown[]
    expect(data.length).toBeGreaterThan(0)
    for (const row of data) {
      const parsed = rowSchemas[table].safeParse(row)
      expect(parsed.success, JSON.stringify(parsed.error?.issues?.slice(0, 3))).toBe(true)
    }
  })

  it("anon cannot read student or ingestion tables via the API", async () => {
    for (const table of ["student_profile", "shortlist", "application_tracker", "source_audit", "review_queue"]) {
      const res = await get(`${table}?select=*&limit=1`)
      expect(res.status, table).toBe(401)
    }
  })

  it("has the expected seed counts", async () => {
    const { rows: c } = await db.query(`
      select (select count(*)::int from public.visa_rule) visa,
             (select count(*)::int from public.grade_mapping) grades,
             (select count(*)::int from public.programme where is_demo) demo,
             (select count(*)::int from public.programme p join public.university u on u.id = p.university_id where p.is_demo and u.country = 'UK' and u.region = 'London') uk_london,
             (select count(*)::int from public.programme p join public.university u on u.id = p.university_id where p.is_demo and u.country = 'UK' and u.region <> 'London') uk_other,
             (select count(*)::int from public.programme p join public.university u on u.id = p.university_id where p.is_demo and u.country = 'CA') ca,
             (select count(*)::int from public.programme p join public.university u on u.id = p.university_id where p.is_demo and u.country = 'US') us,
             (select count(distinct field)::int from public.programme where is_demo) fields,
             (select count(*)::int from public.programme where is_demo and title not like '%Demo%') unlabelled`)
    expect(c[0]).toEqual({
      visa: 16,
      grades: 8,
      demo: 30,
      uk_london: 6,
      uk_other: 6,
      ca: 10,
      us: 8,
      fields: 6,
      unlabelled: 0,
    })
  })
})
