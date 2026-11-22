import { spawnSync } from "node:child_process"

/** After every run: delete the test accounts and test reports the run left behind (one Supabase project). */
export default function globalTeardown() {
  const res = spawnSync(process.execPath, ["scripts/cleanup-test-accounts.mjs", "--tests-only", "--confirm"], {
    stdio: "inherit",
    env: process.env,
  })
  if (res.status !== 0) console.error("Test account cleanup failed: run it again with npm run test:cleanup")
}
