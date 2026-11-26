import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"

const worked = (millions: number) => ({
  nationality: "NG",
  degree_class: "upper_second",
  cgpa: 3.8,
  cgpa_scale: 5,
  field: "computer_data_science",
  ielts: 7,
  budget_total_minor: millions * 100_000_000,
  target_cycle: "2027/28",
  target_term: "fall",
  accommodation_pref: "university_halls",
})

async function withProfile(page: Page, millions: number) {
  await page.context().addCookies([
    {
      name: "sb-profile",
      value: encodeURIComponent(JSON.stringify(worked(millions))),
      url: "http://localhost:3100",
    },
  ])
}

async function noViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([])
}

const noOverflow = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)

test.describe("landing quick match", () => {
  test("shows 3 live results before sign-up, then hands over to the deep search", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("navigation", { name: "Your progress" })).toContainText("Quick search")
    await page.getByRole("button", { name: "UK", exact: true }).click()
    await page.getByRole("button", { name: "Canada", exact: true }).click()
    await page.getByRole("button", { name: "See my matches" }).click()
    await expect(page.getByTestId("quick-result")).toHaveCount(3, { timeout: 15_000 })
    await expect(page.getByTestId("quick-summary")).toContainText("in UK and Canada")
    await expect(page.getByTestId("next-step")).toContainText("Step 2 of 3")
    await expect(page.getByRole("link", { name: "Continue to deep search" })).toBeVisible()
    await noOverflow(page)
    await noViolations(page)
  })
  test("needs a country, and allows at most two", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "See my matches" }).click()
    await expect(page.getByText("Choose at least one country")).toBeVisible()
    await page.getByRole("button", { name: "UK", exact: true }).click()
    await page.getByRole("button", { name: "Canada", exact: true }).click()
    await page.getByTestId("country-US").click()
    await expect(page.getByText("You can choose up to 2 countries")).toBeVisible()
    await expect(page.getByTestId("country-US")).toHaveAttribute("aria-pressed", "false")
    await expect(page.getByRole("button", { name: "UK", exact: true })).toHaveAttribute("aria-pressed", "true")
  })

  test("when nothing fits the budget, it says what would change that", async ({ page }) => {
    await page.goto("/")
    await page.getByLabel("Total budget, in millions of naira").fill("20")
    await page.getByRole("button", { name: "UK", exact: true }).click()
    await page.getByRole("button", { name: "See my matches" }).click()
    await expect(page.getByTestId("quick-summary")).toContainText("Nothing fits yet in UK", { timeout: 15_000 })
    await expect(page.getByTestId("quick-result").first()).toContainText("over your budget")
    const raise = page.getByTestId("suggest-budget")
    await expect(raise).toContainText("Raise your budget to")
    await raise.click()
    await expect(page.getByTestId("quick-summary")).toContainText("fit, in UK", { timeout: 15_000 })
  })
})

test("quick match and full results show the same price", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "UK", exact: true }).click()
  await page.getByRole("button", { name: "Canada", exact: true }).click()
  await page.getByRole("button", { name: "See my matches" }).click()
  const price = await page.getByTestId("quick-result").first().getByText(/^₦/).innerText()
  await withProfile(page, 80)
  await page.goto("/discover")
  await expect(page.getByTestId("match-card").first()).toContainText(price)
})

test.describe("onboarding wizard", () => {
  test("walks 6 steps, survives a refresh and lands on results", async ({ page }) => {
    await page.goto("/onboarding")
    await expect(page.getByTestId("step-1")).toBeVisible()
    // Countries are dropdowns, Nigeria first, not 2-letter codes to type.
    await expect(page.getByLabel("Nationality")).toHaveValue("NG")
    await page.getByLabel("Country you live in").selectOption("GH")
    await page.getByRole("button", { name: "Continue" }).click()
    await page.getByLabel("Degree class").selectOption("upper_second")
    await page.getByLabel("CGPA").fill("3.8")
    await page.getByLabel("Field you want to study").selectOption("computer_data_science")

    await page.reload()
    await expect(page.getByTestId("step-2")).toBeVisible()
    await expect(page.getByLabel("CGPA")).toHaveValue("3.8")

    await page.getByRole("button", { name: "Continue" }).click()
    await page.getByRole("group", { name: "IELTS" }).getByRole("button", { name: "Taken" }).click()
    await page.getByLabel("IELTS score").selectOption("7")
    await noOverflow(page)
    await noViolations(page)
    await page.getByRole("button", { name: "Continue" }).click()
    await page.getByLabel("Total available, in millions of naira", { exact: true }).fill("80")
    await page.getByRole("button", { name: "Continue" }).click()
    await page.getByRole("button", { name: "Canada", exact: true }).click()
    // Optional places, folded away until asked for, from the universities that list programmes.
    await page.getByRole("button", { name: /Particular provinces, states or cities/ }).click()
    const place = page.getByTestId("city-picker").locator('[data-testid^="place-"]').first()
    await place.click()
    await expect(page.getByTestId("city-picker")).toContainText("1 chosen")
    await page.getByLabel("Start in").selectOption("2027/28")
    await page.getByLabel("Term").selectOption("fall")
    await page.getByRole("button", { name: "Continue" }).click()
    await expect(page.getByTestId("step-6")).toBeVisible()
    // Goals come from the admin's pathways; tick the first one offered and it stays ticked after a reload.
    const goal = page.getByTestId("goal-picker").getByRole("button").first()
    await goal.click()
    await expect(goal).toHaveAttribute("aria-pressed", "true")
    await page.reload()
    await expect(page.getByTestId("goal-picker").getByRole("button").first()).toHaveAttribute("aria-pressed", "true")
    await page.getByRole("button", { name: "Next: save your results" }).click()

    // Step 3 of 3 offers an account, but results never wait for one.
    await expect(page).toHaveURL(/\/onboarding\/save$/, { timeout: 15_000 })
    await expect(page.getByRole("heading", { name: "Save your results" })).toBeVisible()
    await page.getByTestId("skip-save").click()
    await expect(page).toHaveURL(/\/discover$/)
    await expect(page.getByTestId("match-card").first()).toBeVisible()
  })

  test("carries the quick search answers into the deep search", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "Canada", exact: true }).click()
    await page.getByRole("button", { name: "See my matches" }).click()
    await page.getByRole("link", { name: "Continue to deep search" }).click({ timeout: 15_000 })
    await expect(page).toHaveURL(/\/onboarding$/)
    await expect(page.getByRole("navigation", { name: "Your progress" })).toContainText("Deep search")
    await expect(page.getByTestId("carried-over")).toBeVisible()
  })
  test("I don't know yet is allowed for the budget", async ({ page }) => {
    await page.goto("/onboarding")
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Continue" }).click()
    await page.getByRole("button", { name: "I don't know yet" }).click()
    await expect(page.getByText("We'll start from ₦60m")).toBeVisible()
  })
})

test.describe("results at ₦80m", () => {
  test.beforeEach(async ({ page }) => {
    await withProfile(page, 80)
    await page.goto("/discover")
    await expect(page.locator('[data-loaded="true"]')).toBeVisible({ timeout: 20_000 })
  })

  test("ranks programmes, with no US results and no accessibility issues", async ({ page }) => {
    await expect(page.getByTestId("match-card").first()).toBeVisible()
    expect(await page.getByTestId("match-card").count()).toBeGreaterThanOrEqual(3)
    await expect(page.getByTestId("match-card").first()).toContainText("₦")
    await expect(page.getByTestId("match-card").filter({ hasText: "USA" })).toHaveCount(0)
    await noOverflow(page)
    await noViolations(page)
  })

  test("shows a match confidence score and a data confidence label per result", async ({ page }) => {
    await expect(page.getByTestId("search-confidence")).toContainText(/Match confidence: (High|Medium|Low) \(\d+%\)/)
    await expect(page.getByTestId("match-card").first().getByTestId("data-confidence")).toContainText(
      /Data confidence: (High|Medium|Low)/
    )
    // Students never see which model answered.
    await expect(page.locator("body")).not.toContainText(/gemini|claude|haiku/i)
  })

  test("the Restricted tab gives the reason", async ({ page }) => {
    await page.getByRole("tab", { name: /Restricted for your nationality/ }).click()
    await expect(page.getByTestId("restricted").first()).toContainText("Proclamation 10998")
    await expect(page.getByRole("link", { name: "Read the official source" }).first()).toBeVisible()
    await noViolations(page)
  })

  test("the cost sheet labels estimates and toggles currency", async ({ page }) => {
    await page.getByTestId("cost-trigger").first().click()
    const sheet = page.getByRole("dialog")
    await expect(sheet.getByTestId("estimated-tag")).toHaveCount(4) // rent, living, health, flights; the visa fee is official
    await expect(sheet.getByText("Flights")).toBeVisible()
    await sheet.getByRole("button", { name: "CAD" }).click()
    await expect(sheet.getByText(/CA\$/).first()).toBeVisible()
    await noViolations(page)
  })

  test("dragging the budget re-ranks after the debounce", async ({ page }) => {
    const count = await page.getByTestId("match-card").count()
    const response = page.waitForResponse("**/api/match")
    await page.getByLabel(/Your budget/).fill("50")
    await response
    await expect.poll(() => page.getByTestId("match-card").count()).toBeLessThan(count)
  })

  test("Show related fields re-runs matching", async ({ page }) => {
    await page.getByLabel(/Your budget/).fill("100") // the programme costs more than ₦80m + 15%
    await page.getByLabel("Show related fields").check()
    await expect(page.getByText("MSc Demo Business Analytics")).toBeVisible({ timeout: 10_000 })
  })

  test("compare holds 3 programmes and fits the screen", async ({ page }) => {
    for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Compare", exact: true }).first().click()
    await page.getByRole("button", { name: "Compare (3)" }).click()
    await expect(page.getByTestId("compare-view")).toBeVisible()
    await noOverflow(page)
    await noViolations(page)
  })

  test("filters narrow the list", async ({ page }) => {
    await page.getByText("Filters").click()
    await page.getByRole("button", { name: "Canada", exact: true }).click()
    await expect(page.getByTestId("match-card").first()).toContainText("Canada")
    await expect(page.getByTestId("match-card").filter({ hasText: "Leeds" })).toHaveCount(0)
  })

  test("programme detail has every section and an official apply link", async ({ page }) => {
    await page.getByTestId("match-card").first().getByRole("link").first().click()
    await expect(page).toHaveURL(/\/programmes\//)
    for (const name of [
      "Overview",
      "Entry rules",
      "English and test requirements",
      "Fees and total cost",
      "Intakes and deadlines",
      "Scholarships",
      "Post-study work",
      "City and accommodation",
    ]) {
      await expect(page.getByRole("heading", { name })).toBeVisible()
    }
    const apply = page.getByRole("link", { name: "Apply on university site" })
    await expect(apply).toHaveAttribute("href", /-demo\.example/)
    await noOverflow(page)
    await noViolations(page)
  })
})

test.describe("results at ₦40m", () => {
  test("nothing ranks, and Closest options shows the gap and scholarships", async ({ page }) => {
    await withProfile(page, 40)
    await page.goto("/discover")
    await expect(page.getByText("Nothing matches yet")).toBeVisible()
    await expect(page.locator('[data-loaded="true"]')).toBeVisible({ timeout: 20_000 })
    await page.getByRole("tab", { name: /Closest options/ }).click()
    await expect(page.getByTestId("near-miss")).toHaveCount(5)
    await expect(page.getByTestId("near-miss").first()).toContainText("₦7.2m over your budget")
    await expect(page.getByTestId("near-miss").first()).toContainText("Scholarships that would help")
    await expect(page.getByTestId("budget-mark")).toHaveCount(5)
    await noOverflow(page)
    await noViolations(page)
  })
})

test("a failed refresh keeps the first results and offers Try again", async ({ page }) => {
  await withProfile(page, 80)
  let blocked = true
  await page.route("**/api/match", (route) => (blocked ? route.abort() : route.continue()))
  await page.goto("/discover")
  await expect(page.getByTestId("match-card").first()).toBeVisible()
  await expect(page.getByRole("alert").filter({ hasText: "couldn't refresh" })).toBeVisible({ timeout: 20_000 })
  blocked = false
  await page.getByRole("button", { name: "Try again" }).click()
  await expect(page.locator('[data-loaded="true"]')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole("alert").filter({ hasText: "couldn't refresh" })).toHaveCount(0)
})

test("explanations show a skeleton, then stream into the cards", async ({ page }) => {
  await withProfile(page, 80)
  await page.route("**/api/match/explanations", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800))
    const res = await page.request.post("/api/match", { data: worked(80) })
    const { ranked } = (await res.json()) as { ranked: { id: string }[] }
    await route.fulfill({
      contentType: "application/x-ndjson",
      body: `${JSON.stringify({ programme_id: ranked[0]!.id, why: "It fits your budget.", watch_out: null })}\n`,
    })
  })
  await page.goto("/discover")
  await expect(page.getByTestId("explanation-skeleton").first()).toBeVisible()
  await expect(page.getByTestId("explanation").first()).toContainText("It fits your budget.")
})

test.describe("country selection", () => {
  test("the filter rail narrows results and Show other countries brings them back", async ({ page }) => {
    await withProfile(page, 80)
    await page.goto("/discover")
    await expect(page.locator('[data-loaded="true"]')).toBeVisible({ timeout: 20_000 })
    await page.getByText("Filters").click()
    await page.getByRole("button", { name: "Canada", exact: true }).click()
    await expect(page.getByTestId("match-card").filter({ hasText: "UK" })).toHaveCount(0)
    await page.getByTestId("show-other-countries").click()
    await expect(page.getByTestId("match-card").filter({ hasText: "UK" }).first()).toBeVisible()
  })

  test("a Nigerian sees the USA marked closed, with the published reason when chosen", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByTestId("country-US")).toContainText("Closed to your passport")
    await expect(page.getByTestId("visa-note")).toHaveCount(0)
    await page.getByTestId("country-US").click()
    await expect(page.getByTestId("visa-note")).toContainText("USA:")
    await expect(page.getByTestId("visa-note")).toContainText("10998")
    await page.getByTestId("country-US").click()
    await expect(page.getByTestId("visa-note")).toHaveCount(0)
  })

  test("quick match keeps to the chosen country", async ({ page }) => {
    await page.goto("/")
    // Not "networkidle": the invisible bot check keeps a connection open.
    await page.waitForLoadState("load")
    await page.getByRole("button", { name: "Canada", exact: true }).click()
    await page.getByRole("button", { name: "See my matches" }).click()
    // A tap right after the page opens waits for the bot check's first token.
    await expect(page.getByTestId("quick-summary")).toContainText("Canada", { timeout: 15_000 })
    await expect(page.getByTestId("quick-result").filter({ hasText: "Leeds" })).toHaveCount(0)
  })
})

test.describe("cookie choice", () => {
  // Starts without the test-wide cookie choice, as a first-time visitor would.
  test.use({ storageState: { cookies: [], origins: [] } })

  test("asks once; essential only keeps answers for this visit, and allowing saves them to the device", async ({
    page,
  }) => {
    await page.goto("/onboarding")
    const banner = page.getByTestId("cookie-banner")
    await expect(banner).toBeVisible()
    await banner.getByRole("button", { name: "Essential only" }).click()
    await expect(banner).toHaveCount(0)
    await expect(page.getByTestId("saved-note")).toContainText("kept for this visit only")
    await page.getByTestId("saved-note").getByRole("button", { name: "Allow cookies" }).click()
    await expect(page.getByTestId("saved-note")).toContainText("saved to this device automatically")
    await page.reload()
    await expect(page.getByTestId("cookie-banner")).toHaveCount(0)
  })
})
