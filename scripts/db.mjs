// Applies supabase/migrations and supabase/seed.sql to SUPABASE_DB_URL over verified TLS.
//
//   npm run db:migrate   apply pending migrations (each in its own transaction)
//   npm run db:seed      run supabase/seed.sql (idempotent)
//   npm run db:status    list applied / pending migrations
//
// Applied versions are recorded in supabase_migrations.schema_migrations, the same table the
// Supabase CLI uses, so `supabase db push` and `supabase migration list` stay consistent.

import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import pg from "pg"

const ROOT = path.resolve(import.meta.dirname, "..")
const MIGRATIONS = path.join(ROOT, "supabase", "migrations")

export async function connect({ attempts = 3 } = {}) {
  if (!process.env.SUPABASE_DB_URL) throw new Error("SUPABASE_DB_URL is not set (see .env.example)")
  // Supabase signs its Postgres certificates with its own CA; verify against it.
  const ca = await readFile(path.join(ROOT, "supabase", "prod-ca-2021.crt"), "utf8")
  for (let attempt = 1; ; attempt++) {
    const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, keepAlive: true, ssl: { ca } })
    // Without a listener a dropped socket crashes the process instead of failing the query.
    client.on("error", (err) => console.error(`database connection error: ${err.message}`))
    try {
      await client.connect()
      return client
    } catch (err) {
      await client.end().catch(() => {})
      if (attempt >= attempts) throw err
      await new Promise((r) => setTimeout(r, 1000 * attempt))
    }
  }
}

async function migrations() {
  const files = (await readdir(MIGRATIONS)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort()
  return files.map((file) => {
    const [, version, name] = file.match(/^(\d+)_(.+)\.sql$/)
    return { file, version, name }
  })
}

async function applied(client) {
  await client.query(`
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key, statements text[], name text
    );`)
  const { rows } = await client.query("select version from supabase_migrations.schema_migrations")
  return new Set(rows.map((r) => r.version))
}

async function migrate(client) {
  const done = await applied(client)
  const pending = (await migrations()).filter((m) => !done.has(m.version))
  if (pending.length === 0) return console.log("No pending migrations.")
  for (const m of pending) {
    const sql = await readFile(path.join(MIGRATIONS, m.file), "utf8")
    await client.query("begin")
    try {
      await client.query(sql)
      await client.query(
        "insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)",
        [m.version, m.name, [sql]]
      )
      await client.query("commit")
      console.log(`applied ${m.file}`)
    } catch (err) {
      await client.query("rollback")
      throw new Error(`${m.file} failed: ${err.message}`, { cause: err })
    }
  }
}

async function status(client) {
  const done = await applied(client)
  for (const m of await migrations()) console.log(`${done.has(m.version) ? "applied" : "pending"}  ${m.file}`)
}

async function seed(client) {
  await client.query(await readFile(path.join(ROOT, "supabase", "seed.sql"), "utf8"))
  const { rows } = await client.query(`
    select (select count(*) from public.visa_rule) visa_rules,
           (select count(*) from public.grade_mapping) grade_mappings,
           (select count(*) from public.university where is_demo) demo_universities,
           (select count(*) from public.programme where is_demo) demo_programmes,
           (select count(*) from public.intake where is_demo) demo_intakes,
           (select count(*) from public.city_cost where is_demo) demo_city_costs`)
  console.log("Seeded:", rows[0])
}

const commands = { migrate, seed, status }
const command = commands[process.argv[2]]
if (process.argv[1] === import.meta.filename) {
  if (!command) {
    console.error(`Usage: node scripts/db.mjs <${Object.keys(commands).join("|")}>`)
    process.exit(1)
  }
  const client = await connect()
  try {
    await command(client)
  } finally {
    await client.end()
  }
}
