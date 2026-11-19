import "server-only"

// Test mode by default: Resend's shared test domain and its simulated inbox, which accepts mail and
// delivers nothing. Real delivery needs both EMAIL_LIVE=true and EMAIL_FROM on a domain verified in
// Resend, set by the owner in the environment. That keeps going live a deliberate decision.
const TEST_FROM = "StudyBridge <onboarding@resend.dev>"
const TEST_INBOX = "delivered@resend.dev"

export type Email = {
  subject: string
  text: string
  /** The student's address. Used only when email is live; otherwise mail goes to the test inbox. */
  to?: string
  html?: string
  attachments?: { filename: string; content: Uint8Array }[]
}

export const emailLive = () => process.env.EMAIL_LIVE === "true" && Boolean(process.env.EMAIL_FROM)

/** Returns false when it couldn't send. With no API key it only logs, for local runs and tests. */
export async function sendEmail({ subject, text, to, html, attachments }: Email): Promise<boolean> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.info(`Email not sent (no RESEND_API_KEY): ${subject}`)
    return true
  }
  const live = emailLive() && Boolean(to)
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: live ? process.env.EMAIL_FROM : TEST_FROM,
      to: live ? to : TEST_INBOX,
      subject,
      text,
      ...(html && { html }),
      ...(attachments?.length && {
        attachments: attachments.map((a) => ({
          filename: a.filename,
          content: Buffer.from(a.content).toString("base64"),
        })),
      }),
    }),
  })
  if (!res.ok) console.error(`Resend refused an email: ${res.status}`)
  return res.ok
}
