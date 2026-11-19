// @vitest-environment node
import { PDFDocument } from "pdf-lib"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { matchProfile, rank } from "@/lib/match"
import { presentResult } from "@/lib/match/present"
import type { Catalogue } from "@/lib/match/types"
import demo from "@/tests/fixtures/demo-catalogue.json"

import { buildReport } from "./build"
import { renderReportHtml, renderReportText } from "./email"
import { pdfSafe, renderReportPdf } from "./pdf"

vi.mock("server-only", () => ({}))

const NOW = new Date("2026-11-05T12:00:00Z")
const catalogue = demo as unknown as Catalogue
const profile = matchProfile.parse({
  nationality: "NG",
  degree_class: "upper_second",
  cgpa: 3.8,
  cgpa_scale: 5,
  field: "computer_data_science",
  ielts: 7,
  budget_total_minor: 80_000_000_00,
  target_cycle: "2027/28",
  target_term: "fall",
  preferred_countries: ["UK", "CA"],
  accommodation_pref: "university_halls",
})
const view = presentResult(rank(profile, catalogue, { now: NOW, demoMode: true }), profile, catalogue, NOW)
const first = [...view.ranked, ...view.more][0]!
const explanations = new Map([[first.id, { why: "Fits your <budget> & grades.", watch_out: "Deadline is soon." }]])
const report = buildReport(profile, view, catalogue, explanations, NOW)
const links = {
  claim: "https://studybridge.example/report/open?r=abc&t=def",
  unsubscribe: "https://studybridge.example/report/unsubscribe?r=abc&t=ghi",
  privacy: "https://studybridge.example/privacy",
  reportError: "https://studybridge.example/discover",
}

describe("report contents", () => {
  it("has the profile, a summary and up to 10 matches from the database", () => {
    expect(report.profile.map((l) => l.label)).toEqual([
      "Course",
      "Grade",
      "English test",
      "Budget",
      "Countries",
      "Intake",
    ])
    expect(report.profile.find((l) => l.label === "Budget")?.value).toBe("₦80m")
    expect(report.matches.length).toBeGreaterThan(0)
    expect(report.matches.length).toBeLessThanOrEqual(10)
    expect(report.summary).toContain(first.title)
    expect(report.matches[0]).toMatchObject({ title: first.title, why: "Fits your <budget> & grades." })
  })

  it("lists programmes that fit once the student has an English test", () => {
    const planned = matchProfile.parse({ ...profile, ielts: null, tests_planned: ["ielts"] })
    const v = presentResult(rank(planned, catalogue, { now: NOW, demoMode: true }), planned, catalogue, NOW)
    const r = buildReport(planned, v, catalogue, new Map(), NOW)
    expect(r.needsEnglish.length).toBeGreaterThan(0)
    expect(r.summary).toContain("once you have an English test score")
    expect(r.nextSteps[0]).toMatch(/^Book an English test/)
  })

  it("says why nothing matched when only an English test is missing", () => {
    const none = matchProfile.parse({ ...profile, ielts: null })
    const v = presentResult(rank(none, catalogue, { now: NOW, demoMode: true }), none, catalogue, NOW)
    expect(buildReport(none, v, catalogue, new Map(), NOW).summary).toMatch(/need an English test score/)
  })

  it("lists deadlines in date order, no more than 6", () => {
    expect(report.deadlines.length).toBeLessThanOrEqual(6)
    const dates = report.deadlines.map((d) => new Date(d.date).getTime())
    expect(dates).toEqual([...dates].sort((a, b) => a - b))
  })
})

describe("report email", () => {
  const html = renderReportHtml(report, links)
  const text = renderReportText(report, links)

  it("stays under 100 KB, needs no images and escapes database text", () => {
    expect(Buffer.byteLength(html)).toBeLessThan(100_000)
    expect(html).not.toMatch(/<img/i)
    expect(html).toContain("Fits your &lt;budget&gt; &amp; grades.")
    expect(html).not.toContain("<budget>")
  })

  it("carries the claim, unsubscribe and privacy links, and a plain-text version", () => {
    for (const href of [links.claim, links.unsubscribe, links.privacy]) {
      expect(html).toContain(href.replace(/&/g, "&amp;"))
      expect(text).toContain(href)
    }
    expect(text).toContain("YOUR TOP MATCHES")
    expect(text).toContain(first.title)
  })

  it("renders the same way every time", () => {
    expect(html).toMatchSnapshot()
  })
})

describe("report PDF", () => {
  let bytes: Uint8Array
  beforeAll(async () => {
    bytes = await renderReportPdf(report, links)
  })

  it("is a valid PDF under 1 MB", async () => {
    expect(bytes.byteLength).toBeLessThan(1_000_000)
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBeGreaterThan(0)
  })

  it("writes the naira sign as NGN, because the standard PDF fonts lack it", () => {
    expect(pdfSafe("₦80m · fit 90")).toBe("NGN 80m · fit 90")
    expect(pdfSafe("Lagos 🇳🇬")).toBe("Lagos ")
  })
})

describe("report links", () => {
  it("only accept a token made for that report and purpose", async () => {
    vi.stubEnv("REPORT_LINK_SECRET", "test-secret")
    const { signReport, verifyReport } = await import("./links")
    const id = "11111111-2222-3333-4444-555555555555"
    const token = signReport(id, "claim")
    expect(verifyReport(id, "claim", token)).toBe(true)
    expect(verifyReport(id, "unsubscribe", token)).toBe(false)
    expect(verifyReport("11111111-2222-3333-4444-666666666666", "claim", token)).toBe(false)
    expect(verifyReport(id, "claim", null)).toBe(false)
    vi.unstubAllEnvs()
  })
})
