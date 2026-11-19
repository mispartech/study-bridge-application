import { z } from "zod"

/**
 * Every activity event and the properties it may carry (docs/SPEC_ACCESS_ADMIN.md, section 4).
 * Strict schemas: enums, numbers, booleans and ids only, so no free text or personal data gets in.
 */
const id = z.string().uuid()
const none = z.object({}).strict()

export const DISMISS_REASONS = ["too_expensive", "wrong_field", "wrong_city", "already_applied", "other"] as const
export const THUMBS_REASONS = ["wrong", "unclear", "not_relevant", "other"] as const

export const DISMISS_LABEL: Record<(typeof DISMISS_REASONS)[number], string> = {
  too_expensive: "Too expensive",
  wrong_field: "Wrong field",
  wrong_city: "Wrong city",
  already_applied: "Already applied",
  other: "Other",
}
export const THUMBS_LABEL: Record<(typeof THUMBS_REASONS)[number], string> = {
  wrong: "Something is wrong",
  unclear: "Hard to follow",
  not_relevant: "Not relevant to me",
  other: "Other",
}

export const EVENT_SCHEMAS = {
  quick_match_run: z.object({ results: z.number().int().min(0).max(100) }).strict(),
  wizard_step_completed: z.object({ step: z.number().int().min(1).max(10) }).strict(),
  wizard_completed: none,
  results_viewed: z.object({ ranked: z.number().int().min(0).max(1000) }).strict(),
  filter_changed: z
    .object({ filter: z.enum(["country", "fee", "sort", "coop", "no_gre", "stem", "related"]) })
    .strict(),
  programme_viewed: none,
  explanation_viewed: none,
  programme_saved: none,
  programme_dismissed: z.object({ reason: z.enum(DISMISS_REASONS) }).strict(),
  suggestion_feedback: z.object({ helpful: z.boolean(), reason: z.enum(THUMBS_REASONS).optional() }).strict(),
  compare_used: z.object({ count: z.number().int().min(1).max(3) }).strict(),
  apply_clicked: none,
  report_emailed: z.object({ reminders: z.boolean(), marketing: z.boolean() }).strict(),
  report_link_opened: none,
  account_created: z.object({ source: z.enum(["report", "save", "advisor", "direct"]) }).strict(),
  tracker_stage_changed: z.object({ stage: z.string().regex(/^[a-z_]{2,30}$/) }).strict(),
  document_checked: z.object({ checked: z.boolean() }).strict(),
  reminder_sent: z.object({ kind: z.enum(["deadline", "change"]) }).strict(),
  reminder_clicked: none,
  advisor_message: z.object({ anonymous: z.boolean() }).strict(),
  advisor_guard_triggered: z.object({ outcome: z.enum(["regenerated", "safe_message"]) }).strict(),
  advisor_thumbs: z.object({ up: z.boolean(), reason: z.enum(THUMBS_REASONS).optional() }).strict(),
  plus_checkout_started: none,
  plus_paid: none,
  error_reported: none,
  account_deleted: none,
} as const satisfies Record<string, z.ZodType>

export type ActivityEvent = keyof typeof EVENT_SCHEMAS
export type ActivityProps<E extends ActivityEvent> = z.infer<(typeof EVENT_SCHEMAS)[E]>

/** Events a browser may send. The rest are recorded only by the server, where they happen. */
export const CLIENT_EVENTS = [
  "quick_match_run",
  "wizard_step_completed",
  "wizard_completed",
  "results_viewed",
  "filter_changed",
  "programme_viewed",
  "explanation_viewed",
  "programme_saved",
  "programme_dismissed",
  "suggestion_feedback",
  "compare_used",
  "apply_clicked",
  "advisor_thumbs",
  "reminder_clicked",
] as const satisfies readonly ActivityEvent[]

export const TARGET_TYPES = ["programme", "report", "user", "intake", "advisor_turn"] as const

/** One event as a browser sends it. */
export const clientEvent = z
  .object({
    event: z.enum(CLIENT_EVENTS),
    target_type: z.enum(TARGET_TYPES).optional(),
    target_id: z.union([id, z.string().regex(/^[0-9a-f]{8,64}$/)]).optional(),
    properties: z.record(z.string(), z.unknown()).default({}),
    session_id: z
      .string()
      .regex(/^[0-9a-f-]{36}$/)
      .optional(),
  })
  .strict()

/** Properties checked against the event's own schema; anything else is refused. */
export function validProperties<E extends ActivityEvent>(event: E, properties: unknown) {
  return EVENT_SCHEMAS[event].safeParse(properties ?? {})
}
