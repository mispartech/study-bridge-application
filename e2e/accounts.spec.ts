import { createClient } from "@supabase/supabase-js"
import { expect, test, type Page } from "@playwright/test"

process.loadEnvFile(".env.local")

const BASE = "http://localhost:3100"
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})
const created: string[] = []

const worked = {
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

/** Real session, no inbox: Supabase's admin API hands over the token a magic link would carry. */
async function signIn(page: Page, next = "/discover") {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email })
  if (error) throw error
  created.push(data.user.id)
  await page.goto(
    `/auth/callback?token_hash=${data.properties.hashed_token}&type=${data.properties.verification_type}&next=${encodeURIComponent(next)}`
  )
  return data.user.id
}

async function accept(page: Page) {
  await expect(page).toHaveURL(/\/consent/)
  await page.getByRole("checkbox").check()
  await expect(page.getByRole("button", { name: "Agree and continue" })).toBeEnabled()
  await page.getByRole("button", { name: "Agree and continue" }).click()
}

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" })

test.afterAll(async () => {
  for (const id of created) await admin.auth.admin.deleteUser(id)
})

test.describe("asking for an account only when it's needed", () => {
  test("quick match stays open to everyone", async ({ page }) => {
    await page.goto("/")
    await page.getByRole("button", { name: "See my matches" }).click()
    await expect(page.getByTestId("quick-result").first()).toBeVisible()
    await expect(page).toHaveURL(/\/$/)
  })

  test("the advisor asks for sign-up, and the form confirms the link", async ({ page }) => {
    await page.route("**/auth/v1/otp*", (route) => route.fulfill({ status: 200, json: {} }))
    await page.goto("/advisor")
    await expect(page).toHaveURL(/\/sign-in\?reason=advisor/)
    let captchaToken: string | undefined
    await page.unroute("**/auth/v1/otp*")
    await page.route("**/auth/v1/otp*", async (route) => {
      captchaToken = (route.request().postDataJSON() as { gotrue_meta_security?: { captcha_token?: string } })
        .gotrue_meta_security?.captcha_token
      await route.fulfill({ status: 200, json: {} })
    })
    await page.getByLabel("Email").fill("student@example.com")
    await expect(page.getByRole("button", { name: /email/i })).toBeEnabled({ timeout: 20_000 })
    await page.getByRole("button", { name: /email/i }).click()
    await expect(page.getByTestId("link-sent")).toBeVisible()
    expect(captchaToken).toBeTruthy()
  })

  test("the advisor API refuses visitors with no session", async ({ request }) => {
    const res = await request.post("/api/advisor", {
      data: { messages: [{ role: "user", content: "Hello" }] },
    })
    expect(res.status()).toBe(401)
  })

  test("an off-site next link stays on this site", async ({ page }) => {
    await page.goto("/auth/callback?next=//evil.example")
    await expect(page).toHaveURL(/\/sign-in\?error=link/)
  })
})

test("sign-up moves browser answers and saved programmes into the account", async ({ page }) => {
  await page
    .context()
    .addCookies([{ name: "sb-profile", value: encodeURIComponent(JSON.stringify(worked)), url: BASE }])
  await page.goto("/discover")
  await expect(page.locator('[data-loaded="true"]')).toBeVisible({ timeout: 20_000 })
  const first = page.getByTestId("match-card").first()
  const title = (await first.getByRole("heading").first().textContent())!
  await first.getByRole("button", { name: /save/i }).click()
  await expect(page).toHaveURL(/\/sign-in\?reason=save/, { timeout: 20_000 })
  await page.evaluate(() =>
    localStorage.setItem(
      "sb-draft",
      JSON.stringify({ ...JSON.parse(localStorage.getItem("sb-draft") ?? "{}"), cgpa: "3.8" })
    )
  )
  const browserSaved = await page.evaluate(() => localStorage.getItem("sb-saved"))
  expect(JSON.parse(browserSaved!)).toHaveLength(1)

  const userId = await signIn(page)
  await accept(page)
  await expect(page).toHaveURL(/\/discover/, { timeout: 20_000 })

  const storage = await page.evaluate(() => [localStorage.getItem("sb-saved"), localStorage.getItem("sb-draft")])
  expect(storage).toEqual([null, null])
  const cookies = await page.context().cookies()
  expect(cookies.find((c) => c.name === "sb-profile")).toBeUndefined()

  const { data: profile } = await admin
    .from("student_profile")
    .select("id, consent_given_at, consent_version, cgpa")
    .eq("user_id", userId)
    .single()
  expect(profile?.consent_given_at).toBeTruthy()
  expect(profile?.consent_version).toBeTruthy()
  const { data: shortlist } = await admin.from("shortlist").select("programme_id").eq("student_id", profile!.id)
  expect(shortlist).toHaveLength(1)

  await page.goto("/shortlist")
  await expect(page.getByTestId("shortlist-item")).toContainText(title.trim())
})

test("a signed-in student sees the same total on results and programme pages", async ({ page }) => {
  const userId = await signIn(page)
  await accept(page)
  await expect(page).toHaveURL(/\/discover/, { timeout: 20_000 })
  await admin.from("student_profile").update(worked).eq("user_id", userId)
  await page.goto("/discover")
  await expect(page.locator('[data-loaded="true"]')).toBeVisible({ timeout: 20_000 })
  const first = page.getByTestId("match-card").first()
  const total = (await first.getByText(/₦\d/).first().textContent())!.match(/₦[\d.]+m/)![0]
  await first.getByRole("link").first().click()
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByText(`${total} first year`)).toBeVisible()
})

test("declining consent stores nothing and signs the student out", async ({ page }) => {
  const userId = await signIn(page)
  await expect(page).toHaveURL(/\/consent/)
  await expect(page.getByRole("link", { name: /privacy/i }).first()).toBeVisible()
  await page.getByRole("button", { name: /no thanks|decline|not now/i }).click()
  await expect(page).toHaveURL(`${BASE}/`, { timeout: 20_000 })
  const { data } = await admin.from("student_profile").select("consent_given_at").eq("user_id", userId).maybeSingle()
  expect(data?.consent_given_at ?? null).toBeNull()
})

test.describe("advisor", () => {
  test("shows the count, cards and sources, then blocks at the limit on the server", async ({ page }) => {
    const userId = await signIn(page, "/advisor")
    await accept(page)
    await expect(page).toHaveURL(/\/advisor/, { timeout: 20_000 })
    await expect(page.getByTestId("messages-left")).toHaveText("5 of 5 messages left today")

    const card = {
      id: "00000000-0000-0000-0000-000000000001",
      title: "MSc Data Analytics",
      university: "Northmoor University",
      city: "Manchester",
      country: "UK",
      total_first_year: "₦59.4m",
      total_first_year_local: "£29.5k",
      stale: false,
      source_url: "https://example.ac.uk/msc",
      last_verified_at: "2026-11-01T00:00:00Z",
    }
    const source = { label: "MSc Data Analytics", source_url: card.source_url, last_verified_at: card.last_verified_at }
    await page.route("/api/advisor", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/x-ndjson",
        body: [
          JSON.stringify({ type: "quota", used: 1, limit: 5 }),
          JSON.stringify({ type: "tool", name: "search_programmes", programmes: [card], sources: [source] }),
          JSON.stringify({ type: "text", text: "**Northmoor** fits your budget." }),
          "",
        ].join("\n"),
      })
    )
    await page.getByLabel("Your question").fill("What can I afford?")
    await page.getByRole("button", { name: "Send" }).click()
    await expect(page.getByTestId("advisor-message")).toContainText("Northmoor fits your budget.")
    await expect(page.getByTestId("advisor-message").locator("strong")).toHaveText("Northmoor")
    await expect(page.getByTestId("messages-left")).toHaveText("4 of 5 messages left today")
    await expect(page.getByTestId("advisor-card")).toContainText("₦59.4m")
    await expect(page.getByTestId("sources")).toHaveCount(0)
    await page.getByLabel("Show sources").check()
    await expect(page.getByTestId("sources")).toContainText("verified 1 Nov 2026")
    await page.unroute("/api/advisor")

    await admin.from("advisor_daily_usage").upsert({ user_id: userId, day: today(), messages: 5 })
    const blocked = await page.request.post("/api/advisor", {
      data: { messages: [{ role: "user", content: "One more?" }] },
    })
    expect(blocked.status()).toBe(429)

    await page.reload()
    await expect(page.getByTestId("limit-message")).toBeVisible()
    await expect(page.getByLabel("Your question")).toHaveCount(0)
  })
})

test.describe("plan and settings", () => {
  test("tracks stage and checklist, and the data export holds them", async ({ page }) => {
    const userId = await signIn(page)
    await accept(page)
    await expect(page).toHaveURL(/\/discover/, { timeout: 20_000 })
    const { data: profile } = await admin.from("student_profile").select("id").eq("user_id", userId).single()
    const { data: programme } = await admin.from("programme").select("id, title").eq("is_demo", true).limit(1).single()
    await admin.from("shortlist").insert({ student_id: profile!.id, programme_id: programme!.id })

    await page.goto("/plan")
    const item = page.getByTestId("plan-item")
    await expect(item).toContainText(programme!.title)
    await page.waitForLoadState("networkidle")
    await item.getByLabel("Stage").selectOption("applied")
    await item.getByLabel("Passport").check()
    await expect(item).toContainText("Documents: 1 of 6 ready")
    await expect(async () => {
      const { data } = await admin.from("application_tracker").select("stage, checklist").eq("student_id", profile!.id)
      expect(data?.[0]?.stage).toBe("applied")
      expect(JSON.stringify(data?.[0]?.checklist)).toContain('"done":true')
    }).toPass({ timeout: 10_000 })

    const exported = await (await page.request.get("/api/account")).json()
    expect(exported.application_tracker).toHaveLength(1)
    expect(exported.shortlist).toHaveLength(1)
  })

  test("delete removes the account and needs typing DELETE", async ({ page }) => {
    const userId = await signIn(page)
    await accept(page)
    await expect(page).toHaveURL(/\/discover/, { timeout: 20_000 })
    expect((await page.request.delete("/api/account", { data: { confirm: "yes" } })).status()).toBe(400)

    await page.goto("/settings")
    const button = page.getByRole("button", { name: "Delete my account" })
    await expect(button).toBeDisabled()
    await page.waitForLoadState("networkidle")
    await page.getByLabel(/Type DELETE/).fill("DELETE")
    await button.click()
    await expect(page).toHaveURL(`${BASE}/`, { timeout: 20_000 })
    const { data } = await admin.auth.admin.getUserById(userId)
    expect(data.user).toBeNull()
    const { data: rows } = await admin.from("student_profile").select("id").eq("user_id", userId)
    expect(rows).toEqual([])
  })
})

test.describe("server-side guards", () => {
  test("the reminders job and the Paystack webhook refuse unsigned calls", async ({ request }) => {
    expect((await request.get("/api/cron/reminders")).status()).toBe(401)
    const webhook = await request.post("/api/webhooks/paystack", {
      data: { event: "charge.success" },
      headers: { "x-paystack-signature": "forged" },
    })
    expect([401, 503]).toContain(webhook.status())
  })
})

test.describe("analytics follow consent", () => {
  const capture = async (page: Page) => {
    const events: string[] = []
    await page.route("https://posthog.invalid/**", (route) => {
      events.push((route.request().postDataJSON() as { event: string }).event)
      return route.fulfill({ status: 200, json: {} })
    })
    return events
  }

  test("a visitor who hasn't consented sends nothing and stores no id", async ({ page }) => {
    const events = await capture(page)
    await page.goto("/")
    await page.waitForLoadState("networkidle")
    await page.getByRole("button", { name: "See my matches" }).click()
    await expect(page.getByTestId("quick-result").first()).toBeVisible()
    await page
      .context()
      .addCookies([{ name: "sb-profile", value: encodeURIComponent(JSON.stringify(worked)), url: BASE }])
    await page.goto("/discover")
    await expect(page.locator('[data-loaded="true"]')).toBeVisible({ timeout: 20_000 })
    expect(events).toEqual([])
    expect(await page.evaluate(() => localStorage.getItem("sb-analytics-id"))).toBeNull()
  })

  test("declining sends nothing; consenting turns events on", async ({ page }) => {
    const events = await capture(page)
    const userId = await signIn(page)
    await expect(page).toHaveURL(/\/consent/)
    await page.waitForLoadState("networkidle")
    expect(events).toEqual([])
    expect((await page.context().cookies()).find((c) => c.name === "sb-analytics")).toBeUndefined()

    await accept(page)
    await expect(page).toHaveURL(/\/discover/, { timeout: 20_000 })
    await admin.from("student_profile").update(worked).eq("user_id", userId)
    await page.goto("/discover")
    await expect(page.locator('[data-loaded="true"]')).toBeVisible({ timeout: 20_000 })
    await expect.poll(() => events).toContain("results_viewed")
  })
})

test.describe("demo banner", () => {
  for (const path of ["/", "/sign-in", "/privacy", "/discover", "/onboarding", "/shortlist"]) {
    test(`shows on ${path}`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByTestId("demo-banner")).toHaveText("Demo data — not real programmes")
    })
  }
})

test("/api/visa-notes rejects a malformed nationality", async ({ request }) => {
  expect((await request.get("/api/visa-notes?nationality=nigeria")).status()).toBe(400)
})

test.describe("admin console", () => {
  test("is a 404 for a signed-in student, and its API refuses them", async ({ page }) => {
    await signIn(page)
    await accept(page)
    await expect(page).toHaveURL(/\/discover/, { timeout: 20_000 })
    await page.goto("/admin")
    await expect(page.getByText(/could not be found|404/i).first()).toBeVisible()
    expect((await page.request.post("/api/admin/review/x", { data: { action: "reject", record: {} } })).status()).toBe(
      404
    )
  })

  test("an admin approves a queued record, which goes live, and handles an error report", async ({ page }) => {
    test.setTimeout(90_000) // two sign-ins and five pages
    const userId = await signIn(page, "/admin")
    await accept(page)
    await admin.auth.admin.updateUserById(userId, { app_metadata: { role: "admin" } })
    const run = userId.slice(0, 8)
    // A fresh session picks up the role.
    await signInAs(page, userId)
    const { data: item } = await admin
      .from("review_queue")
      .insert({
        table_name: "programme",
        proposed: queued(run),
        reason: "e2e",
        source_text: "MSc E2E Analytics page text",
      })
      .select("id")
      .single()
    try {
      await page.goto(`/admin/review/${item!.id}`)
      await expect(page.getByTestId("source-text")).toContainText("MSc E2E Analytics page text")
      await page.getByRole("button", { name: "Approve and publish" }).click()
      await expect(page).toHaveURL(/\/admin\/review$/, { timeout: 20_000 })
      const { data: published } = await admin
        .from("review_queue")
        .select("status, published_programme_id")
        .eq("id", item!.id)
        .single()
      expect(published?.status).toBe("approved")

      const { data: live } = await admin
        .from("programme")
        .select("title, is_demo, requirement(min_uk_class, ielts_min)")
        .eq("id", published!.published_programme_id!)
        .single()
      expect(live).toMatchObject({ title: "MSc E2E Analytics", is_demo: false })
      // Demo mode shows demo programmes only, so a real record approved here never reaches Production.
      await page.goto(`/programmes/${published!.published_programme_id}`)
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("404")

      const { data: demoProgramme } = await admin.from("programme").select("id").eq("is_demo", true).limit(1).single()
      await page.goto(`/programmes/${demoProgramme!.id}`)
      await page.getByRole("button", { name: "Report an error" }).click()
      const note = `The deadline looks out of date (${item!.id.slice(0, 8)}).`
      await page.getByLabel("What looks wrong?").fill(note)
      await page.getByRole("button", { name: "Send report" }).click()
      await expect(page.getByTestId("report-sent")).toBeVisible()
      await page.goto("/admin/reports")
      await expect(page.getByTestId("error-report").filter({ hasText: note })).toBeVisible()
    } finally {
      const { data: row } = await admin
        .from("review_queue")
        .select("published_programme_id")
        .eq("id", item!.id)
        .single()
      if (row?.published_programme_id) await admin.from("programme").delete().eq("id", row.published_programme_id)
      await admin.from("review_queue").delete().eq("id", item!.id)
      await admin
        .from("error_report")
        .delete()
        .like("message", `%(${item!.id.slice(0, 8)})%`)
      await admin.from("university").delete().eq("name", `E2E Test University ${run}`)
    }
  })
})

async function signInAs(page: Page, userId: string) {
  const { data: user } = await admin.auth.admin.getUserById(userId)
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: user.user!.email! })
  if (error) throw error
  const { hashed_token, verification_type } = data.properties
  await page.context().clearCookies()
  await page.goto(`/auth/callback?token_hash=${hashed_token}&type=${verification_type}&next=/admin`)
  await expect(page).toHaveURL(/\/admin/, { timeout: 20_000 })
}

function queued(run: string) {
  const domain = `e2e-${run}.ac.uk`
  return {
    university: {
      name: `E2E Test University ${run}`,
      country: "UK",
      city: "Leeds",
      official_domain: domain,
      region: "Yorkshire",
      is_public: true,
      intl_office_url: `https://www.${domain}/international`,
      register_url: "https://www.gov.uk/government/publications/register-of-licensed-sponsors-students",
    },
    programme: {
      title: "MSc E2E Analytics",
      degree_type: "MSc",
      field: "computer_data_science",
      duration_months: 12,
      programme_url: `https://www.${domain}/msc`,
      apply_url: `https://www.${domain}/apply`,
    },
    requirement: { min_uk_class: "upper_second", english_tests: [{ test: "IELTS", overall_min: 6.5 }] },
    intakes: [
      {
        cycle: "2027/28",
        start_term: "fall",
        start_month: "2027-09",
        deadlines: [{ label: "international", date: "2027-06-30" }],
      },
    ],
    fees: [{ fee_year: "2027/28", tuition_amount: 25000, currency: "GBP", basis: "per_year" }],
    source_urls: [`https://www.${domain}/msc`],
  }
}
