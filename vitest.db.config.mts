import { defineConfig } from "vitest/config"

import { loadTestEnv } from "./tests/guard/supabase-guard.mjs"

// Tests that talk to a real Supabase database: the development project in .env.test.local, never production.
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
