export const REMINDER_DAYS = [30, 14, 3]
export const TRACKER_STAGES = [
  { value: "researching", label: "Researching" },
  { value: "preparing_documents", label: "Preparing documents" },
  { value: "applied", label: "Applied" },
  { value: "offer", label: "Offer" },
  { value: "deposit_paid", label: "Deposit paid" },
  { value: "visa", label: "Visa" },
  { value: "enrolled", label: "Enrolled" },
] as const

/** Past these stages an application deadline no longer applies to the student. */
const STILL_APPLYING = new Set(["researching", "preparing_documents"])
const DAY_MS = 86_400_000

type Deadline = { label: string; date: string }

export type WatchedProgramme = {
  user_id: string
  programme_id: string
  title: string
  stage: string
  deadlines: Deadline[]
}

export type Reminder = {
  user_id: string
  programme_id: string
  kind: "deadline" | "record_change"
  dedupe_key: string
  subject: string
  text: string
}

/** Whole days from today (Lagos) to a yyyy-mm-dd date. */
export function daysUntil(date: string, now: Date) {
  const today = now.toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" })
  return Math.round((Date.parse(date) - Date.parse(today)) / DAY_MS)
}

export function deadlineReminders(watched: WatchedProgramme[], now: Date): Reminder[] {
  return watched
    .filter((w) => STILL_APPLYING.has(w.stage))
    .flatMap((w) =>
      w.deadlines
        .filter((d) => REMINDER_DAYS.includes(daysUntil(d.date, now)))
        .map((d) => {
          const days = daysUntil(d.date, now)
          return {
            user_id: w.user_id,
            programme_id: w.programme_id,
            kind: "deadline" as const,
            dedupe_key: `deadline:${w.programme_id}:${d.label}:${d.date}:${days}`,
            subject: `${days} days left: ${w.title}`,
            text: `The ${d.label} deadline for ${w.title} is ${d.date}. See your plan on StudyBridge.`,
          }
        })
    )
}

export type RecordChange = { audit_id: string; programme_id: string }

/** Anyone who saved a programme hears when its record changes, whatever stage they're at. */
export function changeReminders(watched: WatchedProgramme[], changes: RecordChange[]): Reminder[] {
  return changes.flatMap((change) =>
    watched
      .filter((w) => w.programme_id === change.programme_id)
      .map((w) => ({
        user_id: w.user_id,
        programme_id: w.programme_id,
        kind: "record_change" as const,
        dedupe_key: `change:${change.audit_id}`,
        subject: `Update: ${w.title}`,
        text: `The details for ${w.title} have changed. Check the latest on StudyBridge.`,
      }))
  )
}

export function timeline(items: { programme_id: string; title: string; deadlines: Deadline[] }[], now: Date) {
  return items
    .flatMap((item) =>
      item.deadlines.map((d) => ({
        ...d,
        programme_id: item.programme_id,
        title: item.title,
        days: daysUntil(d.date, now),
      }))
    )
    .filter((d) => d.days >= 0)
    .sort((a, b) => a.date.localeCompare(b.date))
}

export type ChecklistItem = { label: string; done: boolean }

const DOCUMENTS = [
  "Passport",
  "Degree certificate and transcript",
  "English test result",
  "Statement of purpose",
  "Two references",
  "Proof of funds",
]

export const defaultChecklist = (): ChecklistItem[] => DOCUMENTS.map((label) => ({ label, done: false }))
