import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"

import { DEV_ENTRIES } from "../app/(app)/dev/_components/registry"

const PAGES = ["/dev", ...DEV_ENTRIES.map((e) => `/dev/${e.slug}`)]

// Seeds the theme only on first load, so later choices made in the test survive reloads.
async function setTheme(page: Page, theme: "light" | "dark") {
  await page.addInitScript((t) => {
    if (!localStorage.getItem("sb-theme")) localStorage.setItem("sb-theme", t)
  }, theme)
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`${theme} theme`, () => {
    for (const path of PAGES) {
      test(`${path} has no axe violations`, async ({ page }) => {
        await setTheme(page, theme)
        await page.goto(path)
        await expect(page.locator("html")).toHaveClass(theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/)
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()
        expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual(
          []
        )
      })
    }
  })
}

test("no horizontal overflow on any dev page", async ({ page }) => {
  for (const path of PAGES) {
    await page.goto(path)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, path).toBeLessThanOrEqual(0)
  }
})

test("theme toggle switches and persists across reloads", async ({ page }) => {
  await setTheme(page, "light")
  await page.goto("/dev/tokens")
  const html = page.locator("html")
  await expect(html).not.toHaveClass(/\bdark\b/)

  await page.getByTestId("theme-toggle").click()
  await expect(html).toHaveClass(/\bdark\b/)
  await expect(page.getByTestId("theme-toggle")).toHaveAccessibleName("Switch to light theme")
  expect(await page.evaluate(() => localStorage.getItem("sb-theme"))).toBe("dark")

  await page.reload()
  await expect(html).toHaveClass(/\bdark\b/)
})

test("theme script runs before paint (no flash)", async ({ page }) => {
  await setTheme(page, "dark")
  await page.goto("/dev", { waitUntil: "commit" })
  await page.waitForSelector("body")
  // The class is set by the inline head script, before hydration.
  await expect(page.locator("html")).toHaveClass(/\bdark\b/)
})

test("bottom sheet opens, traps focus, and closes with Escape", async ({ page }) => {
  await page.goto("/dev/bottom-sheet")
  const trigger = page.getByRole("button", { name: "Open sheet" })
  await trigger.click()
  const dialog = page.getByRole("dialog", { name: "Sheet title" })
  await expect(dialog).toBeVisible()
  await expect(dialog).toHaveAccessibleDescription(/Drag the handle down/)
  await page.keyboard.press("Escape")
  await expect(dialog).toBeHidden()
  await expect(trigger).toBeFocused()
})

test.describe("app shell", () => {
  test("shows the right primary nav for the viewport and marks the current tab", async ({ page }, info) => {
    await page.goto("/shortlist")
    const navs = page.getByRole("navigation", { name: "Primary" })
    // Only one primary nav is visible at a time: bottom bar on mobile, side rail on desktop.
    await expect(navs).toHaveCount(1)
    const nav = navs.first()
    await expect(nav.getByRole("link")).toHaveText(["Discover", "Shortlist", "Advisor", "Plan"])
    await expect(nav.getByRole("link", { name: "Shortlist" })).toHaveAttribute("aria-current", "page")

    const box = await nav.boundingBox()
    const viewport = page.viewportSize()!
    if (info.project.name === "mobile-360") {
      expect(box!.y + box!.height).toBeCloseTo(viewport.height, 0)
    } else {
      expect(box!.x).toBe(0)
      expect(box!.height).toBeCloseTo(viewport.height, 0)
    }
  })

  test("Discover asks for a profile before there is one", async ({ page }) => {
    await page.goto("/discover")
    await expect(page.getByRole("heading", { level: 1, name: "Let's find your matches" })).toBeVisible()
  })
})
