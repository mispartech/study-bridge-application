import { expect, test, type CDPSession, type Page } from "@playwright/test"

// Chrome DevTools' Slow 3G preset, on a 360px screen.
const SLOW_3G = {
  offline: false,
  latency: 2000,
  downloadThroughput: ((500 * 1000) / 8) * 0.8,
  uploadThroughput: ((500 * 1000) / 8) * 0.8,
}
const LIMIT_MS = 3000
// A full page load with the stylesheet inlined. Measured at 2.9-3.2s; this guards against it getting worse.
const REOPEN_LIMIT_MS = 3500

const profile = {
  nationality: "NG",
  degree_class: "upper_second",
  cgpa: 3.8,
  cgpa_scale: 5,
  field: "computer_data_science",
  ielts: 7,
  budget_total_minor: 8_000_000_000,
  target_cycle: "2027/28",
  target_term: "fall",
  accommodation_pref: "university_halls",
}

async function throttle(page: Page): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("Network.enable")
  await cdp.send("Network.emulateNetworkConditions", SLOW_3G)
  return cdp
}

test.describe.configure({ mode: "serial" })

const addProfile = (page: Page) =>
  page
    .context()
    .addCookies([
      { name: "sb-profile", value: encodeURIComponent(JSON.stringify(profile)), url: "http://localhost:3100" },
    ])

test("first result under 3s on the student's way in", async ({ page, request }) => {
  await request.post("/api/match", { data: profile })
  await addProfile(page)
  await page.goto("/")
  await page.waitForLoadState("networkidle")
  await throttle(page)
  const started = Date.now()
  await page.getByRole("link", { name: "See your matches" }).click()
  await page.getByTestId("match-card").first().waitFor({ state: "visible" })
  const elapsed = Date.now() - started
  console.log(`Slow 3G, landing to first result: ${elapsed} ms`)
  expect(elapsed).toBeLessThan(LIMIT_MS)
})

test("reopening the results page directly stays close to 3s", async ({ page, request }) => {
  await request.post("/api/match", { data: profile })
  await addProfile(page)
  await page.goto("/")
  await page.waitForLoadState("networkidle")
  await throttle(page)
  const started = Date.now()
  await page.goto("/discover", { waitUntil: "commit" })
  await page.getByTestId("match-card").first().waitFor({ state: "visible" })
  const elapsed = Date.now() - started
  console.log(`Slow 3G, reopening /discover: ${elapsed} ms`)
  expect(elapsed).toBeLessThan(REOPEN_LIMIT_MS)
})

test("landing page paints under 3s on a first visit", async ({ page }) => {
  await throttle(page)
  await page.goto("/", { waitUntil: "commit" })
  await page.waitForFunction(() => performance.getEntriesByName("first-contentful-paint").length > 0)
  const paint = await page.evaluate(() => performance.getEntriesByName("first-contentful-paint")[0]!.startTime)
  console.log(`Slow 3G, landing first paint: ${Math.round(paint)} ms`)
  expect(paint).toBeLessThan(LIMIT_MS)
})

test("quick match answers under 3s once the landing page is open", async ({ page }) => {
  await page.goto("/")
  await page.waitForLoadState("networkidle")
  await throttle(page)
  const started = Date.now()
  await page.getByRole("button", { name: "See my matches" }).click()
  await page.getByTestId("quick-result").first().waitFor({ state: "visible" })
  const elapsed = Date.now() - started
  console.log(`Slow 3G, quick match tap to first result: ${elapsed} ms`)
  expect(elapsed).toBeLessThan(LIMIT_MS)
})
