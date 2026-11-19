import "server-only"

/** Names only: admin pages show whether each is set, never its value. */
export const ENV_NAMES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GEMINI_API_KEY",
  "ANTHROPIC_API_KEY",
  "RESEND_API_KEY",
  "EMAIL_LIVE",
  "EMAIL_FROM",
  "PAYSTACK_SECRET_KEY",
  "CRON_SECRET",
  "NEXT_PUBLIC_TURNSTILE_SITE_KEY",
  "TURNSTILE_SECRET_KEY",
  "SENTRY_DSN",
  "NEXT_PUBLIC_SENTRY_DSN",
  "NEXT_PUBLIC_POSTHOG_KEY",
  "NEXT_PUBLIC_POSTHOG_HOST",
] as const

export const envStatus = () => ENV_NAMES.map((name) => ({ name, set: Boolean(process.env[name]) }))
