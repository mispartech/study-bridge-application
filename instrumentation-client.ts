// Browser error reporting, loaded after the page is idle so it costs nothing on the first paint over
// slow 3G. Off until NEXT_PUBLIC_SENTRY_DSN is set. No session replay, tracing or personal data.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  const start = () =>
    void import("@sentry/nextjs").then((Sentry) =>
      Sentry.init({
        dsn,
        environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "local",
        tracesSampleRate: 0,
        integrations: [],
      })
    )
  if ("requestIdleCallback" in window) window.requestIdleCallback(start)
  else setTimeout(start, 2000)
}
