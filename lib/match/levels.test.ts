import { describe, expect, it } from "vitest"

import demo from "@/tests/fixtures/demo-catalogue.json"
import { toRows } from "@/lib/admin/publish"

import { levelAllowed, workMonthsFor } from "./levels"
import { presentResult } from "./present"
import { rank } from "./rank"
import { careerFit } from "./score"
import { bundles } from "./rank"
import { matchProfile, type Catalogue, type MatchProfile } from "./types"

const options = { now: new Date("2026-11-05T12:00:00Z"), demoMode: true }
const KOBO = 100

const student = (over: Partial<MatchProfile> = {}) =>
  matchProfile.parse({
    nationality: "NG",
    degree_class: "upper_second",
    cgpa: 3.8,
    cgpa_scale: 5,
    field: "computer_data_science",
    ielts: 7,
    budget_total_minor: 1_000_000_000 * KOBO,
    target_cycle: "2027/28",
    target_term: "fall",
    preferred_countries: ["CA"],
    ...over,
  })

/**
 * The demo catalogue plus one Canadian college certificate, cloned from a demo Canadian programme: 8 months,
 * entry with any degree, and Canada's work rule saying non-degree programmes earn work rights as long as the
 * programme (as the official PGWP pages say; the real rule is entered by an editor with its source).
 */
function withCertificate(): { cat: Catalogue; certificateId: string } {
  const cat = structuredClone(demo) as unknown as Catalogue
  const base = bundles(cat, true).find(
    (b) => b.university.country === "CA" && b.programme.field === "computer_data_science"
  )!
  const certificateId = "00000000-0000-4000-8000-00000000c0c0"
  cat.programmes.push({
    ...base.programme,
    id: certificateId,
    title: "Graduate Certificate in Data Analytics",
    degree_type: "Other",
    level: "postgraduate_certificate",
    duration_months: 8,
    has_coop_or_placement: false,
  })
  cat.requirements.push({
    ...base.requirement!,
    programme_id: certificateId,
    min_uk_class: null,
    min_gpa4: null,
    min_prior_education: "degree",
  })
  for (const intake of base.intakes)
    cat.intakes.push({ ...intake, id: crypto.randomUUID(), programme_id: certificateId })
  cat.fees.push({ ...base.fee!, programme_id: certificateId })
  for (const rule of cat.visaRules) {
    if (rule.country === "CA" && rule.rule_type === "post_study_work") {
      rule.value = { ...(rule.value as object), non_degree: "programme_length", min_programme_months: 8 }
    }
  }
  return { cat, certificateId }
}

describe("level preference", () => {
  it("lets each choice through only the levels it covers", () => {
    expect(levelAllowed({ level: "masters" }, "masters")).toBe(true)
    expect(levelAllowed({ level: "postgraduate_certificate" }, "masters")).toBe(false)
    expect(levelAllowed({ level: "graduate_diploma" }, "certificate")).toBe(true)
    expect(levelAllowed({ level: "masters" }, "certificate")).toBe(false)
    expect(levelAllowed({ level: "postgraduate_certificate" }, "either")).toBe(true)
    // School-leaver diplomas aren't offered yet.
    expect(levelAllowed({ level: "diploma" }, "either")).toBe(false)
    // Older records have no level: they are Master's.
    expect(levelAllowed({}, "masters")).toBe(true)
  })
})

describe("work rights after study, from the rule's own data", () => {
  const canada = { months: 36, non_degree: "programme_length", min_programme_months: 8 }

  it("gives a Master's the full months", () => {
    expect(workMonthsFor(canada, { level: "masters", duration_months: 12 })).toBe(36)
  })

  it("gives a college programme as long as the programme, and none under the minimum length", () => {
    expect(workMonthsFor(canada, { level: "postgraduate_certificate", duration_months: 8 })).toBe(8)
    expect(workMonthsFor(canada, { level: "graduate_diploma", duration_months: 24 })).toBe(24)
    expect(workMonthsFor(canada, { level: "postgraduate_certificate", duration_months: 6 })).toBe(0)
  })

  it("treats every programme alike when the rule says nothing about non-degree programmes", () => {
    expect(workMonthsFor({ months: 18 }, { level: "postgraduate_certificate", duration_months: 8 })).toBe(18)
    expect(
      workMonthsFor({ months: 18, non_degree: 0 }, { level: "postgraduate_certificate", duration_months: 8 })
    ).toBe(0)
    expect(workMonthsFor(null, { level: "masters", duration_months: 12 })).toBe(0)
  })
})

describe("college programmes in matching", () => {
  it("changes nothing for students who want a Master's (the default)", () => {
    const { cat, certificateId } = withCertificate()
    const before = rank(student(), demo as unknown as Catalogue, options)
    const after = rank(student(), cat, options)
    expect(after.ranked.map((r) => r.bundle.programme.id)).toEqual(before.ranked.map((r) => r.bundle.programme.id))
    expect(after.excluded.find((e) => e.programme_id === certificateId)?.filter).toBe("level")
  })

  it("shows certificates, clearly labelled, to students who choose either", () => {
    const { cat, certificateId } = withCertificate()
    const profile = student({ level_preference: "either" })
    const view = presentResult(rank(profile, cat, options), profile, cat, options.now)
    const card = [...view.ranked, ...view.more].find((c) => c.id === certificateId)
    expect(card).toBeDefined()
    expect(card).toMatchObject({ level: "postgraduate_certificate", level_label: "Postgraduate certificate" })
    expect(
      [...view.ranked, ...view.more].filter((c) => c.id !== certificateId).every((c) => c.level === "masters")
    ).toBe(true)
  })

  it("admits a degree holder where the college asks only for a degree", () => {
    const { cat, certificateId } = withCertificate()
    const result = rank(student({ level_preference: "certificate" }), cat, options)
    expect([...result.ranked, ...result.more].map((r) => r.bundle.programme.id)).toContain(certificateId)
  })

  it("scores a certificate's shorter work rights below a Master's in the same country", () => {
    const { cat, certificateId } = withCertificate()
    const profile = student({ level_preference: "either", post_study_work: "high" })
    const all = bundles(cat, true)
    const certificate = all.find((b) => b.programme.id === certificateId)!
    const masters = all.find(
      (b) =>
        b.university.id === certificate.university.id &&
        b.programme.level === undefined &&
        !b.programme.has_coop_or_placement &&
        b.programme.field === "computer_data_science"
    )
    const fit = (b: typeof certificate) => careerFit(b, b.intakes[0]!, profile, cat, options)
    if (masters) expect(fit(certificate)).toBeLessThan(fit(masters))
    // 8 of Canada's 36 months, with the field matching and no placement, at "high" priority.
    expect(fit(certificate)).toBeCloseTo(0.45 + 0.4 * (8 / 36))
  })
})

describe("a programme too short for work rights", () => {
  it("scores zero for work, not the benefit of the doubt given when no rule is held", () => {
    const { cat, certificateId } = withCertificate()
    cat.programmes.find((p) => p.id === certificateId)!.duration_months = 6
    const profile = student({ level_preference: "either", post_study_work: "high" })
    const short = bundles(cat, true).find((b) => b.programme.id === certificateId)!
    expect(careerFit(short, short.intakes[0]!, profile, cat, options)).toBeCloseTo(0.45)
  })
})

describe("approving a college programme", () => {
  const record = {
    university: {
      name: "Example College",
      country: "CA",
      city: "Toronto",
      official_domain: "example-college.ca",
      region: "Ontario",
      is_public: true,
      institution_type: "public_college",
      register_url: "https://www.canada.ca/dli",
    },
    programme: {
      title: "Data Analytics",
      degree_type: "Other",
      level: "postgraduate_certificate",
      cip_code: "11.0802",
      field: "computer_data_science",
      duration_months: 8,
      programme_url: "https://www.example-college.ca/data",
    },
    requirement: { min_prior_education: "degree", english_tests: [{ test: "IELTS", overall_min: 6.5 }] },
    intakes: [{ start_term: "fall", start_month: "2027-09", deadlines: [{ label: "intl", date: "2027-05-01" }] }],
    fees: [{ fee_year: "2027/28", tuition_amount: 18000, currency: "CAD", basis: "per_year" }],
    source_urls: ["https://www.example-college.ca/data"],
  }

  it("carries the level, CIP code, institution type and prior qualification through", () => {
    const rows = toRows(record)
    expect(rows.programme).toMatchObject({ level: "postgraduate_certificate", cip_code: "11.0802" })
    expect(rows.university.institution_type).toBe("public_college")
    expect(rows.requirement).toMatchObject({ min_prior_education: "degree", min_uk_class: null, min_gpa4: null })
  })

  it("still needs some academic minimum, and a well-formed CIP code", () => {
    expect(() => toRows({ ...record, requirement: { english_tests: [] } })).toThrow(/qualification/)
    expect(() => toRows({ ...record, programme: { ...record.programme, cip_code: "11-0802" } })).toThrow(/CIP/)
  })

  it("defaults older records to a Master's at a university", () => {
    const older = structuredClone(record) as unknown as Record<string, Record<string, unknown>>
    delete older.programme!.level
    delete older.programme!.cip_code
    delete older.university!.institution_type
    older.requirement = { min_gpa4: 3, english_tests: [] }
    const rows = toRows(older)
    expect(rows.programme.level).toBe("masters")
    expect(rows.university.institution_type).toBe("university")
  })
})
