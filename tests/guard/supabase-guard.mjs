// Tests create and delete accounts. StudyBridge uses one Supabase project, so tests against it are allowed only
// when asked for on purpose: `npm run test:e2e` / `npm run test:db` set ALLOW_TESTS_ON_PRODUCTION for that run.
// A bare `npx playwright test`, an IDE runner, or CI is refused. Test accounts are flagged internal by the
// database (kept out of metrics and alerts) and deleted after every run. Project refs are public, not secrets.
import { existsSync } from "node:fs"

export const PRODUCTION_SUPABASE_REFS = ["vtintwtuyauwgabcnayu"]
/** A separate project's settings, if one is ever added. Otherwise the app's own .env.local is used. */
export const TEST_ENV_FILE = ".env.test.local"
export const ALLOW_FLAG = "ALLOW_TESTS_ON_PRODUCTION"

const isProduction = (env, name) => PRODUCTION_SUPABASE_REFS.some((ref) => (env[name] ?? "").includes(ref))

/** Throws unless the settings are safe for this run. Never prints the values. */
export function assertTestTarget(env = process.env) {
  if (!env.NEXT_PUBLIC_SUPABASE_URL) {
    throw new Error("Refusing to run tests: NEXT_PUBLIC_SUPABASE_URL is not set.")
  }
  const production = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_DB_URL"].some((name) => isProduction(env, name))
  if (!production) return
  if (env.CI) {
    throw new Error("Refusing to run tests: CI must never test against the production Supabase project.")
  }
  if (env[ALLOW_FLAG] !== "1") {
    throw new Error(
      "Refusing to run tests: these settings point at the production Supabase project. " +
        "Run them on purpose with `npm run test:e2e` or `npm run test:db`; test accounts are cleaned up afterwards."
    )
  }
}

/** Loads the test settings (.env.test.local if present, else .env.local), then checks them. */
export function loadTestEnv() {
  const file = existsSync(TEST_ENV_FILE) ? TEST_ENV_FILE : ".env.local"
  // loadEnvFile doesn't override variables already set, so clear the Supabase ones first: a value inherited
  // from the shell or another tool can't slip in.
  for (const name of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_DB_URL",
  ]) {
    delete process.env[name]
  }
  process.loadEnvFile(file)
  assertTestTarget()
}
