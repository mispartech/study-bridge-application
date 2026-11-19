import { createClient } from "@supabase/supabase-js"
import { createHmac } from "node:crypto"

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
    // A tap right after the page opens waits for the bot check's first token.
    await expect(page.getByTestId("quick-result").first()).toBeVisible({ timeout: 15_000 })
    await expect(page).toHaveURL(/\/$/)
  })

  test("the sign-in form sends a link with a security token", async ({ page }) => {
    let captchaToken: string | undefined
    await page.route("**/auth/v1/otp*", async (route) => {
      captchaToken = (route.request().postDataJSON() as { gotrue_meta_security?: { captcha_token?: string } })
        .gotrue_meta_security?.captcha_token
      await route.fulfill({ status: 200, json: {} })
    })
    await page.goto("/sign-in?reason=advisor&next=/advisor")
    await page.getByLabel("Email").fill("student@example.com")
    await expect(page.getByRole("button", { name: /email/i })).toBeEnabled({ timeout: 20_000 })
    await page.getByRole("button", { name: /email/i }).click()
    await expect(page.getByTestId("link-sent")).toBeVisible()
    expect(captchaToken).toBeTruthy()
  })

  test("the advisor asks a visitor with no profile to run a quick match first", async ({ page, request }) => {
    await page.goto("/advisor")
    await expect(page).toHaveURL(/\/advisor$/)
    await expect(page.getByRole("link", { name: "Start a quick match" })).toBeVisible()
    const res = await request.post("/api/advisor", { data: { messages: [{ role: "user", content: "Hello" }] } })
    expect(res.status()).toBe(409)
  })

  test("an anonymous visitor gets free messages, then an offer of a free account", async ({ page }) => {
    const device = crypto.randomUUID()
    const keyHash = createHmac("sha256", process.env.IP_HASH_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY!)
      .update(`device:${device}`)
      .digest("hex")
      .slice(0, 32)
    const { data: window } = await admin.rpc("rate_limit_window", { p_window_seconds: 86_400, p_offset_seconds: 3600 })
    // Both of today's free messages already used on this device.
    await admin
      .from("rate_limit")
      .insert({ bucket: "advisor_anon:device", key_hash: keyHash, window_start: window!, hits: 2 })
    try {
      await page.context().addCookies([
        { name: "sb-profile", value: encodeURIComponent(JSON.stringify(worked)), url: BASE },
        { name: "sb-device", value: device, url: BASE },
      ])
      await page.goto("/advisor")
      await expect(page.getByTestId("messages-left")).toHaveText("0 of 2 messages left today")
      await expect(page.getByTestId("limit-message")).toContainText("Create a free account for 5 a day")
      await expect(page.getByLabel("Your question")).toHaveCount(0)
      // The server enforces it too: a request past the limit is refused.
      const blocked = await page.request.post("/api/advisor", {
        data: { messages: [{ role: "user", content: "Hello" }], turnstile_token: "XXXX.DUMMY.TOKEN.XXXX" },
      })
      expect(blocked.status()).toBe(429)
      expect(await blocked.json()).toMatchObject({ anonymous: true, limit: 2 })
      await expect(page.getByRole("link", { name: "Create a free account" })).toHaveAttribute(
        "href",
        "/sign-in?reason=advisor&next=/advisor"
      )
    } finally {
      await admin.from("rate_limit").delete().eq("key_hash", keyHash)
    }
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
    await expect(page.getByTestId("quick-result").first()).toBeVisible({ timeout: 15_000 })
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
    await expect(page).not.toHaveURL(/\/consent/, { timeout: 20_000 })
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

      // The approval is in the audit log, which nobody can change.
      await page.goto("/admin/audit?action=record_approved")
      await expect(page.getByTestId("audit-entry").filter({ hasText: item!.id.slice(0, 8) })).toBeVisible()
      const { data: entry } = await admin
        .from("staff_audit")
        .select("id")
        .eq("target_id", item!.id)
        .eq("action", "record_approved")
        .single()
      const removed = await admin.from("staff_audit").delete().eq("id", entry!.id)
      expect(removed.error?.message).toContain("append-only")
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

test("an admin sees users, AI spend and settings, and can switch a model", async ({ page }) => {
  test.setTimeout(90_000)
  const userId = await signIn(page, "/admin")
  await accept(page)
  await expect(page).not.toHaveURL(/\/consent/, { timeout: 20_000 })
  await admin.auth.admin.updateUserById(userId, { app_metadata: { role: "admin" } })
  await signInAs(page, userId)
  const { data: before } = await admin.from("app_setting").select("value").eq("key", "ai_models").maybeSingle()
  try {
    await page.goto("/admin/users")
    await expect(page.getByTestId("user-row").first()).toBeVisible()
    await page.goto(`/admin/users/${userId}`)
    // Your own role is shown, not editable, so the console always keeps an admin.
    await expect(page.getByText("Role: Admin")).toBeVisible()

    await page.goto("/admin/ai-usage")
    await expect(page.getByRole("heading", { name: "Spend by user" })).toBeVisible()

    await page.goto("/admin/settings")
    await expect(page.getByText("NEXT_PUBLIC_SUPABASE_URL")).toBeVisible()
    await page.getByLabel("advisor").selectOption("google:gemini-3.6-flash")
    await page.getByRole("button", { name: "Save models" }).click()
    await expect(page.getByRole("status")).toContainText("Saved")
    const { data: saved } = await admin.from("app_setting").select("value").eq("key", "ai_models").single()
    expect(saved?.value).toMatchObject({ advisor: { provider: "google", model: "gemini-3.6-flash" } })
  } finally {
    if (before) await admin.from("app_setting").update({ value: before.value }).eq("key", "ai_models")
    else await admin.from("app_setting").delete().eq("key", "ai_models")
  }
})

const reportToken = (id: string, purpose: "claim" | "unsubscribe") =>
  createHmac("sha256", process.env.REPORT_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY!)
    .update(`${purpose}:${id}`)
    .digest("base64url")
    .slice(0, 43)

test("a student says why a match isn't for them; the reason is recorded and Undo restores it", async ({ page }) => {
  const started = new Date().toISOString()
  await page.context().addCookies([
    { name: "sb-profile", value: encodeURIComponent(JSON.stringify(worked)), url: BASE },
    { name: "sb-analytics", value: "1", url: BASE },
  ])
  await page.goto("/discover")
  await expect(page.locator('[data-loaded="true"]')).toBeVisible({ timeout: 20_000 })
  const card = page.getByTestId("match-card").first()
  const title = (await card.getByRole("heading").first().textContent())!.trim()
  await card.getByRole("button", { name: "Not for me" }).click()
  await card.getByRole("button", { name: "Too expensive" }).click()
  const dismissed = page.getByTestId("match-card-dismissed").first()
  await expect(dismissed).toContainText("not for you (too expensive)")
  await expect
    .poll(
      async () => {
        const { data } = await admin
          .from("activity_event")
          .select("properties, target_type, actor_type")
          .eq("event", "programme_dismissed")
          .gte("occurred_at", started)
        return data?.find((e) => (e.properties as { reason?: string }).reason === "too_expensive") ?? null
      },
      { timeout: 15_000 }
    )
    .toMatchObject({ target_type: "programme", actor_type: "anonymous" })
  await dismissed.getByRole("button", { name: "Undo" }).click()
  await expect(page.getByTestId("match-card").first()).toContainText(title)
})

test.describe("emailed report", () => {
  test("a visitor emails their report, and its link signs them in with their results", async ({ page }) => {
    test.setTimeout(90_000)
    const email = `e2e-report-${crypto.randomUUID().slice(0, 8)}@example.com`
    await page
      .context()
      .addCookies([{ name: "sb-profile", value: encodeURIComponent(JSON.stringify(worked)), url: BASE }])
    await page.goto("/discover")
    await expect(page.locator('[data-loaded="true"]')).toBeVisible({ timeout: 20_000 })
    await page.getByRole("button", { name: "Email me this report" }).click()
    // The open form must fit a 360px screen: nothing pushed off the side.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await page.getByLabel("Email address").fill(email)
    // Both consents start unticked.
    await expect(page.getByLabel("Send me deadline reminders for these programmes")).not.toBeChecked()
    await expect(page.getByLabel("Send me occasional scholarship and study-abroad updates")).not.toBeChecked()
    await page.getByLabel("Send me deadline reminders for these programmes").check()
    await page.getByRole("button", { name: "Send my report" }).click()
    await expect(page.getByTestId("email-report")).toContainText(`Sent to ${email}`, { timeout: 20_000 })

    const { data: report } = await admin
      .from("report")
      .select("id, reminders_consent, marketing_consent, claimed_user_id, results_snapshot")
      .eq("email", email)
      .single()
    try {
      expect(report).toMatchObject({ reminders_consent: true, marketing_consent: false, claimed_user_id: null })
      // Nothing else exists until the link is used.
      const before = await admin.auth.admin.listUsers({ perPage: 1000 })
      expect(before.data.users.some((u) => u.email === email)).toBe(false)

      await page.context().clearCookies()
      await page.goto(`/report/open?r=${report!.id}&t=${reportToken(report!.id, "claim")}`)
      await page.getByRole("button", { name: "Open my results" }).click()
      await accept(page)
      await expect(page).toHaveURL(/\/discover/, { timeout: 20_000 })
      await expect(page.getByTestId("match-card").first()).toBeVisible({ timeout: 20_000 })
      const { data: claimed } = await admin.from("report").select("claimed_user_id").eq("id", report!.id).single()
      expect(claimed?.claimed_user_id).toBeTruthy()
      created.push(claimed!.claimed_user_id!)

      // A tampered link is refused.
      await page.context().clearCookies()
      await page.goto(`/report/open?r=${report!.id}&t=${"x".repeat(43)}`)
      await page.getByRole("button", { name: "Open my results" }).click()
      await expect(page).toHaveURL(/\/sign-in\?error=link/)
    } finally {
      await admin.from("report").delete().eq("email", email)
    }
  })

  test("unsubscribing deletes the report", async ({ page }) => {
    const { data: report } = await admin
      .from("report")
      .insert({
        email: `e2e-unsub-${crypto.randomUUID().slice(0, 8)}@example.com`,
        email_hash: "e2e",
        profile_snapshot: worked,
        results_snapshot: {},
        consent_text_version: "e2e",
      })
      .select("id")
      .single()
    try {
      await page.goto(`/report/unsubscribe?r=${report!.id}&t=${reportToken(report!.id, "unsubscribe")}`)
      await page.getByRole("button", { name: "Unsubscribe and delete" }).click()
      await expect(page.getByTestId("unsubscribed")).toBeVisible()
      const { data } = await admin.from("report").select("id").eq("id", report!.id).maybeSingle()
      expect(data).toBeNull()
    } finally {
      await admin.from("report").delete().eq("id", report!.id)
    }
  })
})

/** Signs in with a fresh session and, for staff, completes two-factor like a real authenticator app. */
async function signInAs(page: Page, userId: string, { mfa = true } = {}) {
  const { data: user } = await admin.auth.admin.getUserById(userId)
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: user.user!.email! })
  if (error) throw error
  const { hashed_token, verification_type } = data.properties
  await page.context().clearCookies()
  await page.goto(`/auth/callback?token_hash=${hashed_token}&type=${verification_type}&next=/admin`)
  await expect(page).toHaveURL(/\/staff\/verify/, { timeout: 20_000 })
  if (mfa) await passMfa(page)
}

/** Reads the setup key shown on /staff/verify and enters the current code. */
async function passMfa(page: Page) {
  const secret = (await page.getByTestId("totp-secret").textContent({ timeout: 20_000 }))!.trim()
  await page.getByLabel("6-digit code").fill(totp(secret))
  await page.getByRole("button", { name: "Verify" }).click()
  await expect(page).toHaveURL(/\/admin$/, { timeout: 20_000 })
}

/** RFC 6238 time-based code, as an authenticator app computes it (SHA-1, 30 seconds, 6 digits). */
function totp(base32: string, at = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
  let bits = ""
  for (const c of base32.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, "0")
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)))
  const hash = createHmac("sha1", key).update(counter).digest()
  const offset = hash[hash.length - 1]! & 0xf
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0")
}

/** A signed-in, consented account with the given staff role. */
async function staffAccount(page: Page, role: "support" | "data_editor" | "admin") {
  const userId = await signIn(page, "/admin")
  await accept(page)
  // Wait for consent to be saved (the page moves on) before the role changes and cookies are cleared.
  await expect(page).not.toHaveURL(/\/consent/, { timeout: 20_000 })
  await admin.auth.admin.updateUserById(userId, { app_metadata: { role } })
  return userId
}

test.describe("staff roles and two-factor", () => {
  test("staff must verify with an authenticator before the console or its API opens", async ({ page }) => {
    test.setTimeout(90_000)
    const userId = await staffAccount(page, "admin")
    await signInAs(page, userId, { mfa: false })
    await page.goto("/admin/settings")
    await expect(page).toHaveURL(/\/staff\/verify/)
    const blocked = await page.request.post("/api/admin/settings", {
      data: { key: "advisor_free_limit", value: null },
    })
    expect(blocked.status()).toBe(403)
    expect(await blocked.json()).toMatchObject({ code: "mfa_required" })
    await passMfa(page)
    await expect(page.getByRole("navigation", { name: "Admin" })).toContainText("Settings")
  })

  test("support sees users but can't change roles or edit content", async ({ page }) => {
    test.setTimeout(90_000)
    const userId = await staffAccount(page, "support")
    await signInAs(page, userId)
    const nav = page.getByRole("navigation", { name: "Admin" })
    await expect(nav).toContainText("Users")
    await expect(nav).not.toContainText("Review queue")
    await page.goto("/admin/review")
    await expect(page).toHaveURL(/\/admin\?denied=1/)
    const role = await page.request.post(`/api/admin/users/${crypto.randomUUID()}`, { data: { role: "admin" } })
    expect(role.status()).toBe(403)
    const review = await page.request.post("/api/admin/review/approve-ready")
    expect(review.status()).toBe(403)
  })

  test("an admin sees the overview, exports it, and suspends then deletes an account", async ({ page }) => {
    test.setTimeout(120_000)
    const userId = await staffAccount(page, "admin")
    await signInAs(page, userId)
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible()
    await expect(page.getByTestId("funnel-step")).toHaveCount(7)

    const csv = await page.request.get("/api/admin/export?dataset=funnel&range=7d")
    expect(csv.status()).toBe(200)
    expect(csv.headers()["content-type"]).toContain("text/csv")
    expect((await csv.text()).split(String.fromCharCode(10))[0]?.trim()).toBe("step,people,from_previous")
    const { data: exported } = await admin
      .from("staff_audit")
      .select("id")
      .eq("staff_id", userId)
      .eq("action", "export_downloaded")
    expect(exported?.length).toBeGreaterThan(0)

    const email = `e2e-target-${crypto.randomUUID().slice(0, 8)}@example.com`
    const { data: target } = await admin.auth.admin.createUser({ email, email_confirm: true })
    created.push(target.user!.id)
    await page.goto(`/admin/users?q=${email}`)
    await expect(page.getByTestId("user-row")).toHaveCount(1)
    await page.getByRole("link", { name: email }).click()
    await page.getByLabel("Reason (needed to suspend or delete)").fill("e2e check")
    await page.getByRole("button", { name: "Suspend" }).click()
    await expect(page.getByTestId("suspended")).toBeVisible({ timeout: 20_000 })
    const { data: banned } = await admin.auth.admin.getUserById(target.user!.id)
    expect(banned.user?.banned_until).toBeTruthy()
    await page.getByRole("button", { name: "Lift suspension" }).click()
    await expect(page.getByRole("button", { name: "Suspend" })).toBeVisible({ timeout: 20_000 })

    await page.getByLabel("Reason (needed to suspend or delete)").fill("e2e erasure")
    await page.getByLabel("Type DELETE to confirm").fill("DELETE")
    await page.getByRole("button", { name: "Delete account" }).click()
    await expect(page).toHaveURL(/\/admin\/users$/, { timeout: 20_000 })
    const { data: gone } = await admin.auth.admin.getUserById(target.user!.id)
    expect(gone.user).toBeNull()
    const { data: audited } = await admin
      .from("staff_audit")
      .select("action, reason")
      .eq("target_id", target.user!.id)
      .eq("action", "user_deleted")
      .single()
    expect(audited?.reason).toBe("e2e erasure")
  })

  test("support can't export a user's data", async ({ page }) => {
    test.setTimeout(90_000)
    const userId = await staffAccount(page, "support")
    await signInAs(page, userId)
    const res = await page.request.get(`/api/admin/users/${userId}/export`)
    expect(res.status()).toBe(403)
  })

  test("a data editor works the review queue but can't see users", async ({ page }) => {
    test.setTimeout(90_000)
    const userId = await staffAccount(page, "data_editor")
    await signInAs(page, userId)
    const nav = page.getByRole("navigation", { name: "Admin" })
    await expect(nav).toContainText("Review queue")
    await expect(nav).not.toContainText("Users")
    await page.goto("/admin/users")
    await expect(page).toHaveURL(/\/admin\?denied=1/)
    await page.goto("/admin/review")
    await expect(page.getByText("How often reviewers change each field")).toBeVisible()
  })
})

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
