import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"

type Purpose = "claim" | "unsubscribe"

function secret() {
  const key = process.env.REPORT_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error("REPORT_LINK_SECRET or SUPABASE_SERVICE_ROLE_KEY must be set to sign report links")
  return key
}

/** A token that proves the link came from our email for this report and purpose. */
export function signReport(reportId: string, purpose: Purpose): string {
  return createHmac("sha256", secret()).update(`${purpose}:${reportId}`).digest("base64url").slice(0, 43)
}

export function verifyReport(reportId: string, purpose: Purpose, token: string | null | undefined): boolean {
  if (!token || !/^[0-9a-f-]{36}$/.test(reportId)) return false
  const expected = Buffer.from(signReport(reportId, purpose))
  const given = Buffer.from(token)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/** Links in the email open a page with a button, so mail scanners that follow links can't act on them. */
export function reportLinks(origin: string, reportId: string) {
  const q = (purpose: Purpose) => `r=${reportId}&t=${signReport(reportId, purpose)}`
  return {
    claim: `${origin}/report/open?${q("claim")}`,
    unsubscribe: `${origin}/report/unsubscribe?${q("unsubscribe")}`,
    privacy: `${origin}/privacy`,
    reportError: `${origin}/discover`,
  }
}
export type ReportLinks = ReturnType<typeof reportLinks>
