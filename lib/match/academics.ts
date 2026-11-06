import { BANDS, type Academics, type Band, type Catalogue, type MatchProfile } from "./types"

export const bandIndex = (band: Band) => BANDS.indexOf(band)

/**
 * F2: degree class and/or CGPA + scale to a band, 4.0 GPA and percentage via grade_mapping. A stated
 * class wins over the CGPA estimate. HND + PGD counts as one band below the stated class.
 */
export function normaliseAcademics(
  profile: Pick<MatchProfile, "degree_class" | "cgpa" | "cgpa_scale" | "hnd_pgd">,
  mappings: Catalogue["gradeMappings"]
): Academics {
  const rows = [...mappings].sort((a, b) => b.cgpa_min - a.cgpa_min)
  const onScale = (scale: number) => rows.filter((m) => m.scale === scale)
  const fromCgpa =
    profile.cgpa !== null && profile.cgpa_scale !== null
      ? onScale(profile.cgpa_scale).find((m) => profile.cgpa! >= m.cgpa_min)
      : undefined

  let band: Band | null = profile.degree_class ?? (fromCgpa?.uk_class as Band | undefined) ?? null
  if (band === null && profile.cgpa !== null && profile.cgpa_scale !== null) band = "pass"
  if (band !== null && profile.hnd_pgd) band = BANDS[Math.max(0, bandIndex(band) - 1)]!

  const scale = profile.cgpa_scale ?? 5
  const row = fromCgpa && fromCgpa.uk_class === band ? fromCgpa : onScale(scale).find((m) => m.uk_class === band)
  return {
    band,
    gpa4: row?.gpa4_estimate ?? null,
    percent: row?.percent_estimate ?? null,
    source: profile.degree_class && !profile.hnd_pgd ? "stated" : "estimated",
  }
}

/** The CGPA minimum for the student's scale in a university's Nigeria rule, e.g. "3.50/5.0 or 3.00/4.0". */
export function nigeriaRuleMinimum(rule: string | null, scale: number | null): number | null {
  if (!rule || scale === null) return null
  for (const [, cgpa, ruleScale] of rule.matchAll(/(\d(?:\.\d+)?)\s*\/\s*([45])(?:\.0)?/g)) {
    if (Number(ruleScale) === scale) return Number(cgpa)
  }
  return null
}
