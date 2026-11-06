import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

// The 200-question advisor eval (npm run eval:advisor). Calls the real model, so it isn't part of `npm test`.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: { "server-only": fileURLToPath(new URL("./tests/stubs/empty.ts", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["evals/**/*.eval.ts"],
    testTimeout: 3 * 60 * 60 * 1000,
  },
})
