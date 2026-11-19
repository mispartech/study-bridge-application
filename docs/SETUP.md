# Vercel setup

Everything to configure by hand in Vercel, Supabase, Paystack and GitHub.

Add variables in **Vercel → Project → Settings → Environment Variables**. Tick **Sensitive** for anything marked secret. Never paste a value into a commit, a chat or a ticket.

**`NEXT_PUBLIC_*` values are built into the app.** After changing one, redeploy, or the old value stays live.

## Required

| Variable | Preview | Production | Secret | Where to get it |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Yes | No | Supabase → Project Settings → API. Copy the Project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Yes | No | Supabase → Project Settings → API Keys. Copy the `anon` public key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Yes | **Yes** | Same page. Copy the `service_role` key. It bypasses RLS, so it must never have a `NEXT_PUBLIC_` prefix. |
| `GEMINI_API_KEY` | Yes | Yes | **Yes** | [Google AI Studio](https://aistudio.google.com) → API keys. Runs the advisor and match explanations. |
| `NEXT_PUBLIC_DEMO_MODE` | `true` | `true` for now | No | Type it yourself. `true` includes demo programmes and shows the "Demo data — not real programmes" banner on every page. Set it to `false` only when real, verified records are in the database. |
| `CRON_SECRET` | No | Yes | **Yes** | Make one yourself: run `openssl rand -hex 32`. Vercel sends it to the daily reminders job. Without it the job refuses to run. Vercel runs cron jobs on Production only. |

## Payments, email and analytics

| Variable | Preview | Production | Secret | Where to get it |
| --- | --- | --- | --- | --- |
| `PAYSTACK_SECRET_KEY` | Yes | Yes | **Yes** | Paystack → Settings → API Keys & Webhooks → **Test** Secret Key. It must start with `sk_test_`. A live key is refused, and checkout stays off. |
| `RESEND_API_KEY` | Optional | Optional | **Yes** | Resend → API Keys. Without it, emails are only logged. With it, they go only to Resend's test inbox, never to a student. |
| `NEXT_PUBLIC_POSTHOG_KEY` | Optional | Optional | No | PostHog → Project Settings → Project API Key. Without it, no analytics are sent. Events are sent only after a student gives consent. |
| `NEXT_PUBLIC_POSTHOG_HOST` | Optional | Optional | No | `https://eu.i.posthog.com` for an EU project (the default if unset), or `https://us.i.posthog.com` for a US project. |

## Error reporting

| Variable | Preview | Production | Secret | Where to get it |
| --- | --- | --- | --- | --- |
| `SENTRY_DSN` | Optional | Optional | No | Sentry (free Developer plan) → create a Next.js project → Project Settings → Client Keys (DSN). Without it, the server reports nothing. |
| `NEXT_PUBLIC_SENTRY_DSN` | Optional | Optional | No | The same DSN. Without it, the browser reports nothing. |

## Admin console

`/admin` is open only to accounts with the admin role. Everyone else gets a 404. To make yourself an admin:

1. Sign in on the site once, so your account exists.
2. Run `npm run admin:grant -- you@example.com` on your machine.
3. Sign out and back in.

## Not needed on Vercel

| Variable | Why |
| --- | --- |
| `SUPABASE_DB_URL` | Used by migration scripts and the Python ingestion worker, not the website. |
| `ANTHROPIC_API_KEY` | Used for extraction in the Python worker. The website needs it only if `config/ai.json` moves a website task to Anthropic. |
| `OPENAI_API_KEY`, `OPENROUTER_API_KEY` | Needed only if `config/ai.json` is changed to use them. |
| `INGEST_CONTACT_EMAIL`, `INGEST_API_TOKEN` | Python ingestion worker only. |

## Other settings

**Supabase → Authentication → URL Configuration**

- Site URL: `https://studybridge.mispartechnologies.com/` (done).
- Redirect URLs: `https://studybridge.mispartechnologies.com/**` (done).
- For sign-in on Preview deployments, also add `https://*-mispartechnologies-9823s-projects.vercel.app/**`.
- For local sign-in, also add `http://localhost:3000/**`.

**Supabase → Authentication → Sign In / Providers**

- Turn on Google and enter the client ID and secret from Google Cloud Console.
- In Google Cloud Console, add Supabase's callback URL, shown on that same Supabase page.
- Add custom SMTP before launch. Supabase's built-in sender is heavily rate limited.

**Paystack → Settings → API Keys & Webhooks**

- Set the **Test** Webhook URL to `https://studybridge.mispartechnologies.com/api/webhooks/paystack`.

**GitHub → Repository → Settings → Secrets and variables → Actions**

- Add `GEMINI_API_KEY`. The advisor eval workflow needs it. Scheduled runs start only once the workflow is on `main`.

## Reading a failed API call

| Code | Meaning | Fix |
| --- | --- | --- |
| `SERVER_ENV_MISSING` | A server variable is unset. The response names which. | Add it for that environment, then redeploy. |
| `SERVER_ENV_REJECTED` | The variable is set, but Supabase refused it. | Copy the key again, with no quotes or spaces, then redeploy. |
| `SERVER_ERROR` | Anything else. | Check Vercel logs and Sentry. |

## Regions

Supabase runs in `eu-central-2` (Zurich). Vercel has no Zurich region, so functions run in `fra1` (Frankfurt), the closest one. This is set in `vercel.json`.

## Before you rely on this

- Preview and Production share one Supabase project, so actions on a Preview deployment change the same data as Production.
- After setting the variables, redeploy, then check sign-in, the advisor and a test checkout on the live URL.
