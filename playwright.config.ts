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
    { name: "mobile-360", use: { ...devices["Galaxy S9+"], viewport: { width: 360, height: 740 } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: `http://localhost:${PORT}/dev`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
})
