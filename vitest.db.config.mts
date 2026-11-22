import { defineConfig } from "vitest/config"

import { loadTestEnv } from "./tests/guard/supabase-guard.mjs"

// Tests that talk to the real Supabase database. Run on purpose with `npm run test:db` (refused otherwise).
loadTestEnv()

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/db/**/*.db.test.ts"],
    // One connection, one transaction per test: run serially.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
