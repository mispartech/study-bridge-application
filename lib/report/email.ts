import type { ReportData } from "./build"
import type { ReportLinks } from "./links"

/** Brand tokens from CLAUDE.md, inlined because email clients ignore stylesheets. */
const INK = "#15132B"
const CANVAS = "#F8F7FC"
const PRIMARY = "#5B4CF5"
const MUTED = "#6E6A85"
const DANGER = "#C2183C"
const FONT = "Inter, Arial, Helvetica, sans-serif"

export const REPORT_SUBJECT = "Your Master's options from StudyBridge"
/** Company line for the footer. The contact address comes from REPORT_CONTACT_EMAIL once it is decided. */
export function companyContact(): string {
  const email = process.env.REPORT_CONTACT_EMAIL
  return `StudyBridge by Mispar Technologies${email ? ` · ${email}` : ""}`
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;")
const link = (href: string, text: string) =>
  `<a href="${esc(href)}" style="color:${PRIMARY};text-decoration:underline">${esc(text)}</a>`
const h2 = (text: string) => `<h2 style="font:700 18px/1.3 ${FONT};color:${INK};margin:28px 0 8px">${esc(text)}</h2>`
const p = (html: string, color = INK) =>
  `<p style="font:400 15px/1.5 ${FONT};color:${color};margin:0 0 8px">${html}</p>`
const small = (html: string) => `<p style="font:400 13px/1.5 ${FONT};color:${MUTED};margin:0 0 6px">${html}</p>`

/** The report as HTML email: text first, no images needed, well under 100 KB. */
export function renderReportHtml(r: ReportData, links: ReportLinks): string {
  const matches = r.matches
    .map(
      (m, i) => `
<tr><td style="padding:14px 0;border-top:1px solid #E4E2EE">
${p(`<strong>${i + 1}. ${esc(m.title)}</strong>`)}
${small(`${esc(m.university)}, ${esc(m.city)}, ${esc(m.country)} · ${esc(m.group)} · fit ${m.fit}`)}
${p(`First year: <strong>${esc(m.totalNgn)}</strong> (${esc(m.totalLocal)}) · ${esc(m.budget)}`)}
${p(`Next deadline: ${esc(m.nextDeadline)}`)}
${m.why ? p(`Why it fits: ${esc(m.why)}`) : ""}
${m.watchOut ? p(`Watch out: ${esc(m.watchOut)}`, DANGER) : ""}
${p(
  [
    m.applyUrl ? link(m.applyUrl, "Official apply page") : "",
    link(m.sourceUrl, "Programme page"),
    `verified ${m.verifiedDaysAgo} day${m.verifiedDaysAgo === 1 ? "" : "s"} ago`,
  ]
    .filter(Boolean)
    .join(" · ")
)}
</td></tr>`
    )
    .join("")

  const list = (items: string[]) =>
    items.length
      ? `<ul style="margin:0 0 8px;padding-left:20px">${items.map((i) => `<li style="font:400 15px/1.5 ${FONT};color:${INK};margin:0 0 4px">${i}</li>`).join("")}</ul>`
      : ""

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(REPORT_SUBJECT)}</title></head>
<body style="margin:0;padding:0;background:${CANVAS}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CANVAS}"><tr><td align="center" style="padding:16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border-radius:16px"><tr><td style="padding:24px">
<p style="font:800 20px/1.2 ${FONT};color:${PRIMARY};margin:0 0 12px">StudyBridge</p>
<h1 style="font:800 24px/1.25 ${FONT};color:${INK};margin:0 0 8px">Your Master's options, prepared on ${esc(r.preparedOn)}</h1>
${small(`Prices and rules as of ${esc(r.preparedOn)}. Always confirm on the university's site.`)}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0"><tr><td style="background:${PRIMARY};border-radius:12px">
<a href="${esc(links.claim)}" style="display:inline-block;padding:12px 20px;font:700 15px ${FONT};color:#FFFFFF;text-decoration:none">View and update your results</a>
</td></tr></table>
${h2("Your profile")}
${r.profile.map((l) => p(`<strong>${esc(l.label)}:</strong> ${esc(l.value)}`)).join("")}
${h2("Summary")}
${p(esc(r.summary))}
${r.matches.length ? `${h2("Your top matches")}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${matches}</table>` : ""}
${r.needsEnglish.length ? h2("Could fit once you have an English test") + list(r.needsEnglish.map((n) => `<strong>${esc(n.title)}</strong>, ${esc(n.university)}, ${esc(n.city)}${n.totalNgn ? `: ${esc(n.totalNgn)} first year` : ""}${n.ielts ? ` · asks for IELTS ${n.ielts}` : ""}`)) : ""}
${r.closest.length ? h2("Closest options") + list(r.closest.map((c) => `<strong>${esc(c.title)}</strong>, ${esc(c.university)}: ${esc(c.gap)}${c.scholarships.length ? `. Scholarships that could help: ${c.scholarships.map(esc).join(", ")}` : ""}`)) : ""}
${r.restricted.length ? h2("Restricted for your nationality") + list(r.restricted.map((x) => `${esc(x.title)}, ${esc(x.university)}: ${esc(x.reason)}`)) : ""}
${r.proofOfFunds.length ? h2("Money you'll need to show for the visa") + list(r.proofOfFunds.map((f) => `${esc(f.country)}: ${esc(f.amount)}${f.source ? ` (${link(f.source, "official source")})` : ""}`)) : ""}
${r.deadlines.length ? h2("Your deadline timeline") + list(r.deadlines.map((d) => `<strong>${esc(d.date)}</strong>: ${esc(d.label)}`)) : ""}
${r.scholarships.length ? h2("Scholarships you may qualify for") + list(r.scholarships.map((s) => `${link(s.url, s.name)} (${esc(s.funder)}): ${esc(s.coverage)}${s.deadline ? `, deadline ${esc(s.deadline)}` : ""}`)) : ""}
${r.nextSteps.length ? h2("Next steps") + list(r.nextSteps.map(esc)) : ""}
<div style="margin-top:28px;border-top:1px solid #E4E2EE;padding-top:16px">
${small(`"Estimated" means we used an official minimum or a typical figure because the university doesn't publish its own. Naira figures use the market rate${r.fx.length ? ` (${r.fx.map((f) => `${esc(f.currency)} ₦${f.rate.toLocaleString("en-NG")}`).join(", ")})` : ""}.`)}
${small(`Something wrong? ${link(links.reportError, "Report an error")} from any programme page.`)}
${small(`${link(links.unsubscribe, "Unsubscribe and delete this report")} · ${link(links.privacy, "Privacy notice")}`)}
${small(esc(companyContact()))}
</div>
</td></tr></table>
</td></tr></table>
</body></html>`
}

/** Plain-text alternative, for clients that don't show HTML. */
export function renderReportText(r: ReportData, links: ReportLinks): string {
  const lines: string[] = [
    `StudyBridge: your Master's options, prepared on ${r.preparedOn}`,
    `Prices and rules as of ${r.preparedOn}. Always confirm on the university's site.`,
    "",
    `View and update your results: ${links.claim}`,
    "",
    "YOUR PROFILE",
    ...r.profile.map((l) => `${l.label}: ${l.value}`),
    "",
    "SUMMARY",
    r.summary,
  ]
  if (r.matches.length) {
    lines.push("", "YOUR TOP MATCHES")
    r.matches.forEach((m, i) => {
      lines.push(
        "",
        `${i + 1}. ${m.title}`,
        `   ${m.university}, ${m.city}, ${m.country} · ${m.group} · fit ${m.fit}`,
        `   First year: ${m.totalNgn} (${m.totalLocal}) · ${m.budget}`,
        `   Next deadline: ${m.nextDeadline}`
      )
      if (m.why) lines.push(`   Why it fits: ${m.why}`)
      if (m.watchOut) lines.push(`   Watch out: ${m.watchOut}`)
      if (m.applyUrl) lines.push(`   Apply: ${m.applyUrl}`)
      lines.push(`   Programme page: ${m.sourceUrl} (verified ${m.verifiedDaysAgo} days ago)`)
    })
  }
  const section = (title: string, items: string[]) => {
    if (items.length) lines.push("", title, ...items.map((i) => `- ${i}`))
  }
  section(
    "COULD FIT ONCE YOU HAVE AN ENGLISH TEST",
    r.needsEnglish.map(
      (n) =>
        `${n.title}, ${n.university}, ${n.city}${n.totalNgn ? `: ${n.totalNgn} first year` : ""}${n.ielts ? ` (IELTS ${n.ielts})` : ""}`
    )
  )
  section(
    "CLOSEST OPTIONS",
    r.closest.map((c) => `${c.title}, ${c.university}: ${c.gap}`)
  )
  section(
    "RESTRICTED FOR YOUR NATIONALITY",
    r.restricted.map((x) => `${x.title}, ${x.university}: ${x.reason}`)
  )
  section(
    "MONEY YOU'LL NEED TO SHOW FOR THE VISA",
    r.proofOfFunds.map((f) => `${f.country}: ${f.amount}${f.source ? ` (${f.source})` : ""}`)
  )
  section(
    "YOUR DEADLINE TIMELINE",
    r.deadlines.map((d) => `${d.date}: ${d.label}`)
  )
  section(
    "SCHOLARSHIPS YOU MAY QUALIFY FOR",
    r.scholarships.map((s) => `${s.name} (${s.funder}): ${s.coverage} ${s.url}`)
  )
  section("NEXT STEPS", r.nextSteps)
  lines.push(
    "",
    '"Estimated" means we used an official minimum or a typical figure because the university doesn\'t publish its own.',
    `Unsubscribe and delete this report: ${links.unsubscribe}`,
    `Privacy notice: ${links.privacy}`,
    companyContact()
  )
  return lines.join("\n")
}
