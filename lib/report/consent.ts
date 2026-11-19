/** Bump when the consent wording on the report form changes; each report records the version it was given under. */
export const REPORT_CONSENT_VERSION = "report-2026-11-19"

/** The exact wording on the form, so what was agreed to can always be shown. */
export const REPORT_CONSENT_TEXT = {
  reminders: "Send me deadline reminders for these programmes",
  marketing: "Send me occasional scholarship and study-abroad updates",
  notice: "We use your email to send this report.",
} as const
