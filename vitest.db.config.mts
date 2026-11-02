import { defineConfig } from "vitest/config"

// Tests that talk to the real Supabase database. Run with `npm run test:db` (needs .env.local).
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
