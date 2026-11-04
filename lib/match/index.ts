export { nigeriaRuleMinimum, normaliseAcademics } from "./academics"
export { affordability, intakeStart, ruleOn, totalCost, visaApplicationDate, withinCeiling } from "./cost"
export { academicCheck, admissionTestCheck, englishCheck, hardFilter, matchingIntake, visaRestriction } from "./filters"
export { applyDiversity, bundles, groupFor, rank, TOP_N } from "./rank"
export { academicFit, budgetFit, fitScore } from "./score"
export * from "./types"

/** JSON for API responses: money is bigint internally and travels as a string. */
export function serialise(value: unknown): string {
  return JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v))
}
