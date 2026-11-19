// Server error reporting. Off until SENTRY_DSN is set, and it never collects personal data.
export async function register() {
  if (!process.env.SENTRY_DSN) return
  const Sentry = await import("@sentry/nextjs")
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV ?? "local",
    tracesSampleRate: 0,
  })
}

export async function onRequestError(...args: Parameters<typeof import("@sentry/nextjs").captureRequestError>) {
  if (!process.env.SENTRY_DSN) return
  const { captureRequestError } = await import("@sentry/nextjs")
  captureRequestError(...args)
}
