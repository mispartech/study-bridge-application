"use client"

import * as React from "react"

/** Last resort when the root layout itself fails, so it can't rely on our styles. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  React.useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return
    void import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error))
  }, [error])
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <h1>Something went wrong</h1>
        <p>Please refresh the page. If it keeps happening, try again in a few minutes.</p>
      </body>
    </html>
  )
}
