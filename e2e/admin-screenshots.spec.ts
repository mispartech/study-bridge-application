// Screenshots of every admin page, desktop and 360px, light and dark, for each phase of
// docs/ADMIN_REVAMP_PLAN.md. Runs only through `npm run screenshots:admin`; skipped in the normal suite.
// Email addresses are masked. The images are kept out of git (.gitignore) because the pages show real data.
import { createClient } from "@supabase/supabase-js"
import { mkdirSync } from "node:fs"

import { expect, test, type Page } from "@playwright/test"

import { totp } from "./totp"

const BASE = "http://localhost:3100"
const PHASE = process.env.ADMIN_SCREENSHOTS_PHASE ?? "phase-1"
const OUT = `docs/screenshots/admin-revamp/${PHASE}`

const PAGES = [
  ["/admin", "overview"],
  ["/admin/alerts", "alerts"],
  ["/admin/users", "users"],
  ["/admin/emailed-reports", "emailed-reports"],
  ["/admin/feedback", "feedback"],
  ["/admin/review", "review"],
  ["/admin/reports", "error-reports"],
  ["/admin/visa-rules", "visa-rules"],
  ["/admin/fx", "exchange-rates"],
  ["/admin/estimates", "flights-and-health"],
  ["/admin/payments", "payments"],
  ["/admin/ai-usage", "ai-usage"],
  ["/admin/advisor", "advisor"],
  ["/admin/settings", "settings"],
  ["/admin/pathways", "pathways"],
  ["/admin/audit", "audit"],
  ["/admin/system", "system"],
  ["/admin/diagnostics", "diagnostics"],
] as const

const VIEWPORTS = { desktop: { width: 1280, height: 800 }, phone: { width: 360, height: 740 } } as const

async function link(page: Page, email: string) {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email })
  if (error) throw error
  await page.context().clearCookies()
  await page.context().addCookies([{ name: "sb-cookies", value: "all", url: BASE }])
  await page.goto(
    `/auth/callback?token_hash=${data.properties.hashed_token}&type=${data.properties.verification_type}&next=/admin`
  )
  return { admin, id: data.user.id }
}

test("admin screenshots", async ({ page }) => {
  test.skip(process.env.ADMIN_SCREENSHOTS !== "1", "run with npm run screenshots:admin")
  test.setTimeout(900_000)
  mkdirSync(OUT, { recursive: true })
  const email = `e2e-screens-${Date.now()}@example.com`
  const { admin, id } = await link(page, email)
  try {
    await page.getByRole("checkbox").check()
    await page.getByRole("button", { name: "Agree and continue" }).click()
    await expect(page).not.toHaveURL(/\/consent/, { timeout: 20_000 })
    await admin.auth.admin.updateUserById(id, { app_metadata: { role: "admin" } })
    await link(page, email)
    await expect(page).toHaveURL(/\/staff\/verify/, { timeout: 20_000 })
    const secret = (await page.getByTestId("totp-secret").textContent({ timeout: 20_000 }))!.trim()
    await page.getByLabel("6-digit code").fill(totp(secret))
    await page.getByRole("button", { name: "Verify" }).click()
    await expect(page).toHaveURL(/\/admin$/, { timeout: 20_000 })

    for (const [name, viewport] of Object.entries(VIEWPORTS)) {
      await page.setViewportSize(viewport)
      for (const theme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: theme })
        for (const [path, slug] of PAGES) {
          await page.goto(path)
          await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible({ timeout: 20_000 })
          await page.waitForLoadState("networkidle").catch(() => {})
          await page.screenshot({
            path: `${OUT}/${slug}-${name}-${theme}.jpg`,
            fullPage: true,
            type: "jpeg",
            quality: 70,
            mask: [page.getByText(/[\w.+-]+@[\w-]+\.[\w.]+/).filter({ visible: true })],
          })
        }
      }
    }
  } finally {
    await admin.auth.admin.deleteUser(id)
  }
})
