import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib"

import type { ReportData } from "./build"
import type { ReportLinks } from "./links"

const PAGE = { width: 595.28, height: 841.89 } // A4
const MARGIN = 48
const INK = rgb(0x15 / 255, 0x13 / 255, 0x2b / 255)
const MUTED = rgb(0x6e / 255, 0x6a / 255, 0x85 / 255)
const PRIMARY = rgb(0x5b / 255, 0x4c / 255, 0xf5 / 255)
const DANGER = rgb(0xc2 / 255, 0x18 / 255, 0x3c / 255)

/** The standard PDF fonts only cover Windows-1252, so the naira sign becomes "NGN " and anything else is dropped. */
const WIN_ANSI_EXTRA = new Set("–—‘’“”•…€·")
export function pdfSafe(text: string): string {
  return text
    .replace(/₦/g, "NGN ")
    .split("")
    .filter((c) => {
      const code = c.charCodeAt(0)
      return (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.has(c)
    })
    .join("")
}

type Style = { font: PDFFont; size: number; color?: ReturnType<typeof rgb>; gap?: number }

class Writer {
  page: PDFPage
  y = PAGE.height - MARGIN
  constructor(private doc: PDFDocument) {
    this.page = doc.addPage([PAGE.width, PAGE.height])
  }
  private ensure(height: number) {
    if (this.y - height < MARGIN) {
      this.page = this.doc.addPage([PAGE.width, PAGE.height])
      this.y = PAGE.height - MARGIN
    }
  }
  text(raw: string, { font, size, color = INK, gap = 4 }: Style) {
    const width = PAGE.width - MARGIN * 2
    const words = pdfSafe(raw).split(/\s+/).filter(Boolean)
    let line = ""
    const flush = () => {
      this.ensure(size + gap)
      this.page.drawText(line, { x: MARGIN, y: this.y - size, size, font, color })
      this.y -= size + gap
      line = ""
    }
    for (const word of words) {
      const next = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(next, size) > width && line) {
        flush()
        line = word
      } else line = next
    }
    if (line) flush()
  }
  space(points: number) {
    this.y -= points
  }
}

/** The report as a PDF attachment, same sections as the email. Kept small: no images, standard fonts. */
export async function renderReportPdf(r: ReportData, links: ReportLinks): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle("Your Master's options - StudyBridge")
  doc.setAuthor("StudyBridge")
  const regular = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const w = new Writer(doc)
  const body: Style = { font: regular, size: 10.5 }
  const muted: Style = { font: regular, size: 9, color: MUTED }
  const heading = (t: string) => {
    w.space(10)
    w.text(t, { font: bold, size: 13, gap: 6 })
  }
  const bullets = (items: string[]) => items.forEach((i) => w.text(`- ${i}`, body))

  w.text("StudyBridge", { font: bold, size: 16, color: PRIMARY, gap: 8 })
  w.text(`Your Master's options, prepared on ${r.preparedOn}`, { font: bold, size: 18, gap: 6 })
  w.text(`Prices and rules as of ${r.preparedOn}. Always confirm on the university's site.`, muted)
  w.text(`View and update your results: ${links.claim}`, { ...muted, color: PRIMARY })

  heading("Your profile")
  r.profile.forEach((l) => w.text(`${l.label}: ${l.value}`, body))
  heading("Summary")
  w.text(r.summary, body)

  if (r.matches.length) {
    heading("Your top matches")
    r.matches.forEach((m, i) => {
      w.space(4)
      w.text(`${i + 1}. ${m.title}`, { font: bold, size: 11 })
      w.text(`${m.university}, ${m.city}, ${m.country} · ${m.group} · fit ${m.fit}`, muted)
      w.text(`First year: ${m.totalNgn} (${m.totalLocal}) · ${m.budget}`, body)
      w.text(`Next deadline: ${m.nextDeadline}`, body)
      if (m.why) w.text(`Why it fits: ${m.why}`, body)
      if (m.watchOut) w.text(`Watch out: ${m.watchOut}`, { ...body, color: DANGER })
      if (m.applyUrl) w.text(`Apply: ${m.applyUrl}`, muted)
      w.text(`Programme page: ${m.sourceUrl} (verified ${m.verifiedDaysAgo} days ago)`, muted)
    })
  }
  if (r.needsEnglish.length) {
    heading("Could fit once you have an English test")
    bullets(
      r.needsEnglish.map(
        (n) =>
          `${n.title}, ${n.university}, ${n.city}${n.totalNgn ? `: ${n.totalNgn} first year` : ""}${n.ielts ? ` (IELTS ${n.ielts})` : ""}`
      )
    )
  }
  if (r.closest.length) {
    heading("Closest options")
    bullets(r.closest.map((c) => `${c.title}, ${c.university}: ${c.gap}`))
  }
  if (r.restricted.length) {
    heading("Restricted for your nationality")
    bullets(r.restricted.map((x) => `${x.title}, ${x.university}: ${x.reason}`))
  }
  if (r.proofOfFunds.length) {
    heading("Money you'll need to show for the visa")
    bullets(r.proofOfFunds.map((f) => `${f.country}: ${f.amount}${f.source ? ` (source: ${f.source})` : ""}`))
  }
  if (r.deadlines.length) {
    heading("Your deadline timeline")
    bullets(r.deadlines.map((d) => `${d.date}: ${d.label}`))
  }
  if (r.scholarships.length) {
    heading("Scholarships you may qualify for")
    bullets(
      r.scholarships.map((s) => `${s.name} (${s.funder}): ${s.coverage}${s.deadline ? `, deadline ${s.deadline}` : ""}`)
    )
  }
  if (r.nextSteps.length) {
    heading("Next steps")
    bullets(r.nextSteps)
  }
  w.space(14)
  w.text(
    '"Estimated" means we used an official minimum or a typical figure because the university does not publish its own.',
    muted
  )
  w.text(`Privacy notice: ${links.privacy}`, muted)
  return doc.save()
}
