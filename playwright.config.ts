import { defineConfig, devices } from "@playwright/test"

const PORT = Number(process.env.PORT ?? 3100)

// Runs against a production build: dev mode is slower and behaves differently.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    // 360px Android baseline from CLAUDE.md.
    {
      name: "mobile-360",
      testIgnore: /slow-3g/,
      use: { ...devices["Galaxy S9+"], viewport: { width: 360, height: 740 } },
    },
    {
      name: "desktop",
      testIgnore: /slow-3g/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    // Timing test: runs alone, after everything else, so parallel tests can't skew it.
    {
      name: "slow-3g",
      testMatch: /slow-3g/,
      dependencies: ["mobile-360", "desktop"],
      use: { ...devices["Galaxy S9+"], viewport: { width: 360, height: 740 } },
    },
  ],
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: `http://localhost:${PORT}/dev`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    // A fake PostHog, so tests can prove when events are and aren't sent.
    env: {
      NEXT_PUBLIC_POSTHOG_KEY: "phc_test",
      NEXT_PUBLIC_POSTHOG_HOST: "https://posthog.invalid",
      // Cloudflare's documented test key: the widget always passes.
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    },
  },
})
