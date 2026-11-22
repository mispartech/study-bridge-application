// Tests create and delete accounts, so they must never run against production. Every test runner that touches
// Supabase (Playwright, the database tests) loads .env.test.local through this file and stops here if the
// settings point at the production project. Project refs are public (they're in the site URL), not secrets.
import { existsSync } from "node:fs"

export const PRODUCTION_SUPABASE_REFS = ["vtintwtuyauwgabcnayu"]
export const TEST_ENV_FILE = ".env.test.local"

/** Throws if any Supabase setting names a production project. Never prints the values. */
export function assertNotProduction(env = process.env) {
  const settings = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_DB_URL"]
  for (const name of settings) {
    const value = env[name] ?? ""
    if (PRODUCTION_SUPABASE_REFS.some((ref) => value.includes(ref))) {
      throw new Error(
        `Refusing to run tests: ${name} points at the PRODUCTION Supabase project. ` +
          `Put the development project's settings in ${TEST_ENV_FILE}.`
      )
    }
  }
  if (!env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error(`Refusing to run tests: NEXT_PUBLIC_SUPABASE_URL is not set. Add it to ${TEST_ENV_FILE}.`)
  }
}

/** Loads .env.test.local over anything already set, then checks it. .env.local (production) is never read. */
export function loadTestEnv() {
  if (!existsSync(TEST_ENV_FILE)) {
    throw new Error(
      `Refusing to run tests: ${TEST_ENV_FILE} is missing. Copy .env.example to ${TEST_ENV_FILE} and fill it ` +
        "with the development Supabase project's settings (never production)."
    )
  }
  // loadEnvFile doesn't override variables that are already set, so clear the Supabase ones first: a value
  // inherited from the shell or another tool can't slip production in.
  for (const name of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_DB_URL",
  ]) {
    delete process.env[name]
  }
  process.loadEnvFile(TEST_ENV_FILE)
  assertNotProduction()
}
