import "server-only"

import { serviceClient } from "@/lib/db/service"
import { sendEmail } from "@/lib/email/send"
import { explainTop } from "@/lib/match/explanations"
import type { MatchView } from "@/lib/match/present"
import type { Catalogue, MatchProfile, MatchResult } from "@/lib/match/types"

import { buildReport } from "./build"
import { renderReportHtml, renderReportText, REPORT_SUBJECT } from "./email"
import { reportLinks } from "./links"
import { renderReportPdf } from "./pdf"

const EXPLANATION_WAIT_MS = 20_000

/** Explanations for the top matches: cached ones straight away, new ones if they arrive in time. */
async function collectExplanations(profile: MatchProfile, result: MatchResult, catalogue: Catalogue, now: Date) {
  const found = new Map<string, { why: string; watch_out: string | null }>()
  const run = (async () => {
    for await (const e of explainTop(profile, result, catalogue, { now })) {
      found.set(e.programme_id, { why: e.why, watch_out: e.watch_out })
    }
  })().catch((err: unknown) => console.error("Report explanations failed:", err instanceof Error ? err.message : err))
  await Promise.race([run, new Promise((resolve) => setTimeout(resolve, EXPLANATION_WAIT_MS))])
  return found
}

/** Builds, renders and sends one report, then records how it went. Runs after the response is sent. */
export async function deliverReport(input: {
  reportId: string
  email: string
  origin: string
  profile: MatchProfile
  result: MatchResult
  view: MatchView
  catalogue: Catalogue
  now: Date
}) {
  const { reportId, email, origin, profile, result, view, catalogue, now } = input
  let ok = false
  try {
    const explanations = await collectExplanations(profile, result, catalogue, now)
    const data = buildReport(profile, view, catalogue, explanations, now)
    const links = reportLinks(origin, reportId)
    const pdf = await renderReportPdf(data, links)
    ok = await sendEmail({
      to: email,
      subject: REPORT_SUBJECT,
      text: renderReportText(data, links),
      html: renderReportHtml(data, links),
      attachments: [{ filename: "studybridge-report.pdf", content: pdf }],
    })
  } catch (err) {
    console.error("Report delivery failed:", err instanceof Error ? err.message : err)
  }
  const { error } = await serviceClient()
    .from("report")
    .update({ delivery_status: ok ? "sent" : "failed", sent_at: ok ? new Date().toISOString() : null })
    .eq("id", reportId)
  if (error) console.error("report status update failed:", error.message)
}
