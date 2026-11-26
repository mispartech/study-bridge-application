// The deliberate way to run tests that touch Supabase (one project, so it's production):
//   npm run test:e2e [-- playwright args]     npm run test:db
//   npm run screenshots:admin                  admin screenshots, light and dark, desktop and 360px
// Sets ALLOW_TESTS_ON_PRODUCTION for this run only, so a bare `npx playwright test` is still refused.
// Test accounts are deleted afterwards (Playwright's global teardown, and here for the database tests).
import { spawnSync } from "node:child_process"

import { loadTestEnv } from "../tests/guard/supabase-guard.mjs"

const [kind, ...args] = process.argv.slice(2)
process.env.ALLOW_TESTS_ON_PRODUCTION = "1"
loadTestEnv() // the same checks: still refused in CI
const env = { ...process.env }
const node = process.execPath
const run = (script, scriptArgs) => spawnSync(node, [script, ...scriptArgs], { stdio: "inherit", env }).status ?? 1

let status
if (kind === "e2e") status = run("node_modules/@playwright/test/cli.js", ["test", ...args])
else if (kind === "screenshots") {
  env.ADMIN_SCREENSHOTS = "1"
  status = run("node_modules/@playwright/test/cli.js", [
    "test",
    "e2e/admin-screenshots.spec.ts",
    "--project=desktop",
    ...args,
  ])
} else if (kind === "db") {
  status = run("node_modules/vitest/vitest.mjs", ["run", "--config", "vitest.db.config.mts", ...args])
  run("scripts/cleanup-test-accounts.mjs", ["--tests-only", "--confirm"])
} else throw new Error("Usage: node scripts/run-tests.mjs e2e|db|screenshots [args]")
process.exitCode = status
