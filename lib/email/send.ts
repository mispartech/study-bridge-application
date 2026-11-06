import "server-only"

// Test mode: Resend's shared test domain and its simulated inbox, which accepts mail and delivers
// nothing. These are constants on purpose, and the student's address isn't a parameter, so this code
// can't reach a real person. Going live means changing this file, and that's a decision to take then.
const FROM = "StudyBridge <onboarding@resend.dev>"
const TEST_INBOX = "delivered@resend.dev"

export type Email = { subject: string; text: string }

/** Returns false when it couldn't send. With no API key it only logs, for local runs and tests. */
export async function sendEmail({ subject, text }: Email): Promise<boolean> {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.info(`Email not sent (no RESEND_API_KEY): ${subject}`)
    return true
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from: FROM, to: TEST_INBOX, subject, text }),
  })
  if (!res.ok) console.error(`Resend refused an email: ${res.status}`)
  return res.ok
}
