import "server-only"

import { createHash } from "node:crypto"

import { serviceClient } from "@/lib/db/service"

export type AcademicBand = "first" | "upper_second" | "lower_second" | "third" | "unknown"

/**
 * NGN budget bands (whole naira, upper bounds exclusive). A product setting, not a fact:
 * wider bands mean more cache hits, narrower ones more tailored explanations.
 */
export const BUDGET_BANDS_NGN = [
  { band: "under_20m", below: 20_000_000 },
  { band: "20m_40m", below: 40_000_000 },
  { band: "40m_70m", below: 70_000_000 },
  { band: "70m_plus", below: Infinity },
] as const

export function budgetBand(budgetTotalMinorNgn: number | bigint | null | undefined): string {
  if (budgetTotalMinorNgn == null) return "unknown"
  const naira = Number(BigInt(budgetTotalMinorNgn) / 100n)
  return BUDGET_BANDS_NGN.find((b) => naira < b.below)!.band
}

/**
 * Nationality group for caching. Students whose nationality is under a current visa
 * restriction need different explanations, so they get their own group; the restricted
 * set comes from visa_rule rows, never from code.
 */
export function nationalityGroup(nationality: string | null | undefined, restricted: ReadonlySet<string>): string {
  if (!nationality) return "unknown"
  if (nationality === "NG") return restricted.has("NG") ? "NG_restricted" : "NG"
  return restricted.has(nationality) ? "restricted" : "other"
}

export type BucketInput = {
  field: string | null | undefined
  academicBand: AcademicBand
  budgetTotalMinorNgn: number | bigint | null | undefined
  nationality: string | null | undefined
  restrictedNationalities: ReadonlySet<string>
}

/** profile_bucket = field + academic band + budget band + nationality group. */
export function profileBucket(p: BucketInput): string {
  return [
    p.field ?? "unknown",
    p.academicBand,
    budgetBand(p.budgetTotalMinorNgn),
    nationalityGroup(p.nationality, p.restrictedNationalities),
  ].join("|")
}

/**
 * Version of a programme's source data. Pass the programme row and every related row the
 * explanation draws on (requirement, fees, intakes); any change regenerates the explanation.
 */
export function sourceVersion(records: unknown[]): string {
  return createHash("sha256").update(stableStringify(records)).digest("hex").slice(0, 32)
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      // Bookkeeping timestamps change without the facts changing.
      .filter(([k]) => k !== "updated_at" && k !== "created_at" && k !== "last_verified_at")
      .sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

export type ExplanationContent = { why: string; watch_out: string | null }

/** Cached explanations for a bucket, keeping only those whose source version still matches. */
export async function readExplanations(
  bucket: string,
  versions: ReadonlyMap<string, string>
): Promise<Map<string, ExplanationContent>> {
  const { data, error } = await serviceClient()
    .from("explanation_cache")
    .select("programme_id, content, source_version")
    .eq("profile_bucket", bucket)
    .in("programme_id", [...versions.keys()])
  if (error) console.error("explanation_cache read failed:", error.message)
  const hits = new Map<string, ExplanationContent>()
  for (const row of data ?? []) {
    if (versions.get(row.programme_id) === row.source_version) {
      hits.set(row.programme_id, JSON.parse(row.content) as ExplanationContent)
    }
  }
  return hits
}

export async function writeExplanations(
  bucket: string,
  items: { programmeId: string; version: string; content: ExplanationContent }[],
  model: { provider: string; model: string }
): Promise<void> {
  if (items.length === 0) return
  const { error } = await serviceClient()
    .from("explanation_cache")
    .upsert(
      items.map((item) => ({
        programme_id: item.programmeId,
        profile_bucket: bucket,
        source_version: item.version,
        content: JSON.stringify(item.content),
        provider: model.provider,
        model: model.model,
      }))
    )
  if (error) console.error("explanation_cache upsert failed:", error.message)
}
