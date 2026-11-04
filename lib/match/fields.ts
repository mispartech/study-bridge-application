import type { Bundle, MatchProfile } from "./types"

/**
 * Programmes outside a field code that a student may still want, when they opt in. Product choice,
 * not a fact. Only computer_data_science has a list so far.
 */
const RELATED_TITLES: Partial<Record<NonNullable<MatchProfile["field"]>, RegExp>> = {
  computer_data_science: /artificial intelligence|\bAI\b|machine learning|analytics|\bdata\b/i,
}

export type FieldMatch = "exact" | "related" | "none"

/** Field is a hard filter. A student who hasn't chosen one yet sees every field. */
export function fieldMatch(
  programme: Bundle["programme"],
  profile: Pick<MatchProfile, "field" | "include_related_fields">
): FieldMatch {
  if (profile.field === null || programme.field === profile.field) return "exact"
  const related = profile.include_related_fields ? RELATED_TITLES[profile.field] : undefined
  return related?.test(programme.title) ? "related" : "none"
}
