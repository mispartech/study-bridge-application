# StudyBridge: application report for the admin dashboard revamp

Snapshot as of 22 November 2026 (`main` at the access/admin merge). Use it as context for a phased revamp plan. The codebase is the source of truth: check anything here against it before building.

## 1. The product

StudyBridge matches Nigerian (and, later, other African) students to Master's programmes in the UK and Canada. The USA is listed but shown as closed to Nigerian passports, because US F/M/J visa issuance is suspended for them. Matching uses grades, English tests, a naira budget, and city and accommodation preferences. Every result links to the official university apply page.

**Rules that also bind the admin:**
- Facts (fees, deadlines, requirements, links, visa rules) come only from the database.
- Every record carries `source_url`, `last_verified_at` and `confidence`, and freshness is shown.
- Apply links must be on an allow-listed official university domain.
- Visa eligibility is a hard filter.
- Money is shown in NGN first and stored in integer minor units.
- The student side is mobile-first: a 360px screen on slow 3G. The admin is used on desktop and phone.

**Stack:**
- Next.js 16 (App Router, cache components), TypeScript, Tailwind, shadcn/ui.
- Supabase Postgres with RLS, plus pgvector.
- Python FastAPI ingestion workers (`/ingest`).
- AI through an adapter configured per task in `/config/ai.json`: Gemini Flash for the advisor, Claude Haiku for extraction.
- Paystack, Resend, PostHog (not yet configured in Production), Sentry and Cloudflare Turnstile.
- Tests: Vitest (about 415 unit tests) and Playwright (about 170 end-to-end tests on desktop, a 360px phone and slow 3G).

## 2. Student journey (what the admin oversees)

1. **Quick search** on `/`, no account needed. The student gives course, CGPA, budget and up to 2 countries, and sees 3 live results. If nothing fits, they get specific suggestions (raise the budget, change country, or change course). It is protected by an invisible Turnstile check plus a signed 30-minute "verified" pass.
2. **Deep search** on `/onboarding`, a 6-step wizard:
   - who you are
   - academics
   - tests
   - budget
   - preferences, including optional provinces and cities
   - goals

   Answers save to the device as they are typed. The cookie choice (Allow / Essential only) decides whether that storage lasts or ends with the visit.
3. **Save your results** on `/onboarding/save`, optional. A magic link or Google sign-in leads to a consent screen (NDPA 2023). The answers then move into the account, and the student lands on `/discover` with a welcome and setup checklist.
4. **Results** on `/discover`. The student sees ranked matches, closest options, visa restrictions and the total cost in NGN, can switch to GBP/CAD/USD, and can see data freshness. From there they can:
   - save programmes
   - dismiss one with "Not for me" and a reason
   - give thumbs feedback
   - email themselves the report, with a claim link that creates an account
   - open programme detail on `/programmes/[id]`
   - use the shortlist on `/shortlist`
   - use the plan on `/plan`
   - use the AI advisor on `/advisor`, with daily limits and anonymous use allowed
   - use Plus via Paystack

**Data pipeline:**
- Python workers fetch official pages and extract fields with AI, then validate and diff them.
- Each extracted record goes to the review queue.
- A data editor approves it, and only then can it reach students.
- City costs, FX rates (a daily cron), flights and health cover, and visa rules are reference data that staff maintain.

## 3. Access model (built in this phase)

- **Roles:** `support`, `data_editor` and `admin`, stored in Supabase `app_metadata.role`. Students have no role.
- **Permissions:** `users.read`, `users.manage`, `users.erase`, `content`, `roles`, `settings`, `ai`, `payments`, `audit`, `overview`.
  - support: `users.read`, `users.manage`, `overview`
  - data_editor: `content`
  - admin: all permissions
- **Two-factor (TOTP)** is mandatory for staff, at assurance level aal2. Staff sessions expire after 8 hours idle.
- **Checks:** every page and every admin API checks its own permission on the server.
- **Audit log:** every staff action is written to `staff_audit`, which is append-only and enforced by a database trigger.
- **Activity events:** these go to `activity_event`, validated by strict Zod schemas. They are anonymous until consent and are purged on a schedule.

## 4. The current admin, page by page

The navigation is a flat, wrapping row of 16 text links at the top. Each page is a stack of cards. Most pages share a date-range filter (today / 7 / 30 / 90 days / custom, in Lagos days) with an audited CSV export.

| Page | Who | What it shows / does today |
|---|---|---|
| **Overview** `/admin` | admin, support | 7-step funnel: quick match → wizard → full results → report or account → saved → apply click → paid Plus. "At a glance" KPI table with today / 7d / 30d columns: new accounts, emailed reports, reports opened as accounts, apply clicks, Plus revenue, advisor messages, AI cost, guard triggers, error reports, pending review count. Breakdowns of courses, countries and budgets searched. Most-saved and most-dismissed programmes with reasons. Data editors see their queues here instead. |
| **Users** `/admin/users` and `/admin/users/[id]` | support+, admin | Search by email. User detail: profile summary, activity, suspend or lift (Supabase ban, reason required), change role (admin), export the user's data and delete the account (admin, typed confirmation, audited). |
| **Emailed reports** | support+, admin | Reports sent to visitors: delivery status, consents, claimed or not, conversion %. Block an address. |
| **Suggestions and feedback** | admin, support | How students act on each suggestion type, plus thumbs on explanations and advisor answers. |
| **Review queue** `/admin/review` and `/admin/review/[id]` | data_editor, admin | Extracted programmes, city costs and health plans waiting for approval. Programmes come first, because a programme approval creates its university. Field-level validation errors, source link, edit and approve or reject, and "Approve all ready". |
| **Error reports** `/admin/reports` | data_editor, admin | Data problems reported by students. |
| **Visa rules** | data_editor, admin | Restrictions by nationality and destination, with source and verification date. |
| **Exchange rates** `/admin/fx` | data_editor, admin | Official rates (daily cron) and market rates entered by hand. Until a market rate is entered, the official rate is used and labelled. |
| **Flights and health** `/admin/estimates` | data_editor, admin | Cost estimates used in the total cost. |
| **AI usage** | admin | Spend per account and the latest generations, priced from Settings. |
| **Advisor monitor** | admin | Messages per day, cost by model, guard triggers and thumbs. Never the message text. |
| **Payments** | admin | Paystack transactions and refunds (admin only, audited). |
| **Settings** | admin | Runtime settings such as advisor limits and model prices. |
| **Audit log** | admin | Every staff action, newest first, read-only. |
| **System** | admin | Scheduled jobs (reminders at 07:00 UTC, FX at 06:00 UTC), email mode and delivery counts, ingestion in the last 7 days, Sentry status, and the environment-variable checklist (names only). |
| **Diagnostics** | admin | Technical checks. |

**Known weaknesses of the current admin (the reasons for the revamp):**
- **Navigation:** 16 flat links with no grouping, no icons, no indication of where you are, and nothing designed for phone use.
- **Overview:** a table-heavy page. There are no charts, no trend comparison with the previous period, no alerts, and no clear "what needs me today".
- **Content work:** spread across 5 pages (review, error reports, visa rules, FX, estimates). There is no single view of data freshness, stale records, records nearing their deadline, or coverage gaps by country, city or field.
- **Missing entirely:** global search, notifications and alerts (failed jobs, email failures, review backlog, stale data, AI spend spikes), saved views, and bulk actions beyond "Approve all ready".
- **Ingestion:** only a summary line is visible. Staff can't schedule, start or retry runs from the admin, or see per-source health.
- **Students:** no segmenting of users (by country, field, budget, journey stage) and no cohort or retention view.
- **Design:** pages use the student design tokens but don't follow a consistent admin layout, such as page header, filters, KPI tiles, data tables with sorting and pagination, and detail drawers.

## 5. Version 1 scope additions from industry feedback (Canada)

A Nigerian-trained accounting professional now working in Canada advised on what students need. The revamp should plan admin support for maintaining this data:
1. **Funded study:** prioritise schools and colleges with funding and scholarships. Many Canadian colleges and provinces offer funding, with lower costs and entry requirements than universities.
2. **College diplomas and certificates in Canada, not only Master's:** in Canada, a diploma or professional certification is often what gets someone the job. This is a new programme level, with its own requirements and fees.
3. **Priority disciplines:** fields that fill labour gaps in a province or state, such as in-demand occupation lists and provincial nominee priorities.
4. **Life after study:** what employers require (certifications, licensing bodies, Canadian experience), good areas to rent, job markets by city, and cost of living.

All of this must follow the same rules as the existing data: official sources, `source_url`, `last_verified_at`, `confidence` and admin review. It implies new tables and new review-queue types, such as:
- colleges and diploma programmes
- funding
- in-demand occupations by province
- certification and licensing paths
- rent areas by city

## 6. What a good plan should cover

- **Information architecture:** grouped navigation for Monitor, Students, Content and data, Money, AI and System, with role-based home pages for admin, support and data editor.
- **Overview:** KPI tiles with trend against the previous period, charts for the funnel and its drop-off, an alerts panel, and a "needs attention" list.
- **Content hub:** a freshness and coverage dashboard, a unified review queue across record types, bulk actions, diffs against the live record, and ingestion run controls.
- **Students:** segments, journey stage, cohort retention, and a user timeline built from `activity_event`.
- **Data model and admin screens** for the Version 1 additions in section 5.
- **Shared admin components:** page header, filter bar, data table, detail drawer, empty states, and phone layouts.
- **Constraints:** every change keeps server-side permission checks, MFA and the audit log, and adds tests (Vitest and Playwright) as each phase ships.
