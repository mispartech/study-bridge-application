# StudyBridge — project brief
StudyBridge matches African (Nigeria-first) students to Master's programmes in the UK, Canada and USA,
based on grades, tests, budget (in NGN), city and accommodation preferences, and returns official apply links.

## Non-negotiables
- Facts (fees, deadlines, requirements, links, visa rules) come ONLY from the database. Never hard-code or invent them.
- Every record has source_url, last_verified_at, confidence. Show freshness in the UI.
- Apply links must be on an allow-listed official university domain.
- Visa eligibility by nationality is a hard filter (US F/M/J issuance is suspended for Nigerian nationals as of Nov 2026).
- Money is shown in NGN first, with GBP/CAD/USD on toggle. Use integer minor units in the DB.
- Mobile-first, works on a 360px Android screen over slow 3G.

## Stack
Next.js (App Router) + TypeScript + Tailwind + shadcn/ui + Framer Motion; Supabase Postgres + pgvector + RLS;
Python FastAPI ingestion workers; AI through the adapter, set per task in /config/ai.json (Gemini Flash advisor for now, claude-haiku-5-5 extraction);
Paystack; Resend; PostHog.

## Design tokens
ink #15132B, canvas #F8F7FC, surface #FFFFFF, primary #5B4CF5, accent #FF7A59,
success #12B886, warning #F59F00, danger #F03E5E, muted #6E6A85. Dark-mode values in /styles/tokens.css.
Headings Plus Jakarta Sans; body Inter with tabular numerals. Radius 16 cards, 12 buttons. 8px grid.

## Conventions
Strict TypeScript, Zod for every API boundary, server components by default, tests with Vitest + Playwright.
Never read, print or inspect values in .env files. Use .env.example for variable names only.
