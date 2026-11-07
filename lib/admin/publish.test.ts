// @vitest-environment node
import { describe, expect, it } from "vitest"

import { isAdmin } from "@/lib/auth/roles"

import { PublishError, toRows } from "./publish"

const record = () => ({
  university: {
    name: "University of Example",
    country: "UK",
    city: "Leeds",
    official_domain: "example.ac.uk",
    region: "Yorkshire",
    is_public: true,
    intl_office_url: "https://www.example.ac.uk/international",
    register_url: "https://www.gov.uk/register",
    sponsor_licence: true,
  },
  programme: {
    title: "MSc Data Science",
    degree_type: "MSc",
    field: "computer_data_science",
    duration_months: 12,
    study_mode: "full_time",
    programme_url: "https://www.example.ac.uk/msc",
    apply_url: "https://www.example.ac.uk/apply",
  },
  requirement: {
    min_uk_class: "upper_second",
    english_tests: [
      { test: "IELTS", overall_min: 6.5 },
      { test: "TOEFL_iBT", scale: "0-120", overall_min: 88 },
    ],
    gre_required: "not_required",
    gmat_required: "unknown",
  },
  intakes: [
    {
      cycle: "2027/28",
      start_term: "fall",
      start_month: "2027-09",
      deadlines: [{ label: "international", date: "2027-06-30", date_precision: "day" }],
    },
  ],
  fees: [{ fee_year: "2027/28", tuition_amount: 28_500, currency: "GBP", basis: "per_year", application_fee: 50 }],
  source_urls: ["https://www.example.ac.uk/msc"],
})

describe("toRows", () => {
  it("maps a reviewed record to integer minor units and our columns", () => {
    const rows = toRows(record())
    expect(rows.fees[0]).toMatchObject({ tuition_per_year_minor: 2_850_000, application_fee_minor: 5000 })
    expect(rows.requirement).toMatchObject({
      ielts_min: 6.5,
      toefl_entries: [{ scale: "0-120", min: 88 }],
      gre_status: "not_required",
      gmat_status: null,
    })
    expect(rows.intakes[0]).toMatchObject({ start_month: "2027-09-01" })
    expect(rows.intakes[0]!.deadlines).toEqual([{ label: "international", date: "2027-06-30" }])
    expect(rows.university).toMatchObject({ official_domains: ["example.ac.uk"], confidence: "official" })
  })

  it("carries the professional fields, defaulting to no registration needed", () => {
    expect(toRows(record()).requirement).toMatchObject({
      requires_professional_registration: "none",
      checks_required: [],
      open_to_international: null,
    })
    const nursing = record() as ReturnType<typeof record> & { requirement: Record<string, unknown> }
    Object.assign(nursing.requirement, {
      requires_professional_registration: "nurse",
      leads_to_registration: "NMC",
      clinical_placement: true,
      open_to_international: "limited",
      checks_required: ["police", "health"],
    })
    expect(toRows(nursing).requirement).toMatchObject({
      requires_professional_registration: "nurse",
      leads_to_registration: "NMC",
      clinical_placement: true,
      open_to_international: "limited",
      checks_required: ["police", "health"],
    })
  })

  it("every row carries its source", () => {
    const rows = toRows(record())
    for (const row of [rows.programme, rows.requirement, ...rows.intakes, ...rows.fees, rows.university]) {
      expect(row.source_url).toMatch(/^https:/)
      expect(row.confidence).toBeTruthy()
    }
  })

  it("accepts a total only for a course of a year or less", () => {
    const one = record()
    one.fees[0]!.basis = "total"
    expect(toRows(one).fees[0]!.tuition_per_year_minor).toBe(2_850_000)
    const two = record()
    two.fees[0]!.basis = "total"
    two.programme.duration_months = 24
    expect(() => toRows(two)).toThrow(/edit it to a yearly amount/)
  })

  it("says what's missing instead of publishing a gap", () => {
    const bad = record() as unknown as { programme: { apply_url: string | null }; fees: unknown[] }
    bad.programme.apply_url = null
    bad.fees = []
    expect(() => toRows(bad)).toThrow(PublishError)
    expect(() => toRows(bad)).toThrow(/programme\.apply_url.*fees: At least one fee/)
  })
})

describe("isAdmin", () => {
  it("needs the role in app_metadata, which only the server can set", () => {
    expect(isAdmin({ app_metadata: { role: "admin" } })).toBe(true)
    expect(isAdmin({ app_metadata: {} })).toBe(false)
    expect(isAdmin({ app_metadata: {}, user_metadata: { role: "admin" } })).toBe(false)
    expect(isAdmin(null)).toBe(false)
  })
})
