# Admin revamp: decisions record

Phase 0 of `docs/ADMIN_REVAMP_PLAN.md`, done on 23 Nov 2026 against `main` at `f90b1a5`. No code was changed.

## 1. Decisions for John

The answer column is filled in as each decision is made; later phases read it from here.

| # | Decision | Recommendation | Answer |
|---|---|---|---|
| D1 | **Charts library** (admin only) | Recharts, loaded only on admin routes, through dynamic import so it stays out of the student bundle. Hand-rolled SVG is smaller but slower to build, and the funnel, trend and cohort charts all need hover and axes. | **Agreed 23 Nov**, as recommended. |
| D2 | **Scheduled jobs** | `vercel.json` has two daily crons, which fits the Hobby plan limit (once a day), but the code can't show which plan the account is on, so confirm it. Recommendation either way: use Supabase `pg_cron` every 15 minutes, posting to an app endpoint over `pg_net`. `pg_net` is already enabled and used the same way for role-change alerts. Alerts are also re-checked on Overview load, cached for 5 minutes, and the daily digest stays on a Vercel cron. | **Agreed 23 Nov.** The Vercel plan is Hobby: crons run at most once a day, and only within the hour they're set for. So `pg_cron` (every 15 minutes, over `pg_net`) evaluates the alerts, and the daily digest stays on a Vercel cron. |
| D3 | **Ingestion hosting** (Phase 7) | Keep the workers local for now. Phase 7 still builds the job queue; until a worker is deployed, "Start run" shows "Waiting for a worker" with the command to run. Fly.io or Railway can come later with no schema change. | **Agreed 23 Nov**, as recommended. |
| D4 | **Version 1 provinces** | Ontario (Toronto, 3 live universities) and Nova Scotia (Halifax, 2 live), then British Columbia (demo data only so far). Quebec comes later, even though Montreal has 1 live university: CEGEP AEC/DEC programmes are often taught in French. | **Agreed 23 Nov**, as recommended. |
| D5 | **UK in Phases 5–6** | Canada first; UK shortage and licensing data come after Version 1. | **Agreed 23 Nov**, as recommended. |
| D6 | **Testing migrations with one Supabase project** (new: the plan's rule "test on the development project first" no longer applies, see difference 1) | Every migration is additive and backward-compatible: new tables and columns, and functions replaced in place. Each is applied with `npm run db:migrate`, then checked straight away with `npm run test:db` and the relevant end-to-end tests. Anything destructive (drops, renames, NOT NULL on existing data) goes in its own later migration, after the code no longer uses the old shape, and records how to undo it in a comment at the top. | **Agreed 23 Nov**, as recommended. |
| D7 | **Funding table** (new, Phase 4) | Extend the existing `scholarship` table instead of creating a new `funding` table. It already has funder, fields, nationalities, amount in minor units, deadline, URL and the standard content fields, and matching already reads it. Add `type`, `open_to_international`, `levels`, `renewable` and `percent_of_tuition`, and show it as "Funding" in the admin. | **Agreed 23 Nov**, as recommended. |
| D8 | **Record-type column in the review queue** (new, Phase 3) | Keep the existing `review_queue.table_name` as the record type. Don't add `record_type`. | **Agreed 23 Nov**, as recommended. |
| D9 | **Alert thresholds** (new, Phase 2) | Store thresholds as keys in the existing `app_setting` table (key → jsonb, audited from the Settings page). Don't add an `alert_rule_setting` table. | **Agreed 23 Nov**, as recommended. |

## 2. Differences between the brief and the code

Items marked **affects plan** change what a later phase builds.

### Process and rules

1. **affects plan.** The plan says migrations are tested on a development Supabase project first. Since 22 Nov there is one project only. Tests run against it only through `npm run test:e2e` and `npm run test:db`. A bare Playwright run, the IDE runner and CI are refused by `tests/guard/supabase-guard.mjs`. Test accounts are cleaned up after every run. See D6.
2. The brief predates the 22 Nov production-safety work, which it doesn't mention:
   - `internal_actor`, `app_metadata.is_internal` and the "Include internal" toggle on Overview, AI usage and Advisor.
   - The summary RPCs now take `p_include_internal`.
   - `role_change_alert` and `alert_endpoint`: database-triggered email to admins on any role change, over `pg_net`.
   - `scripts/cleanup-test-accounts.mjs`.

   **affects plan:** `metric_daily` (Phase 2) must leave internal accounts out the same way, and the alerts engine should reuse the role-alert delivery pattern.

### Access

3. **affects plan.** Permissions are defined in `lib/auth/roles.ts`, not `lib/admin/permissions.ts`. The page helper `requireStaff(permission)` is in `lib/auth/staff-page.ts`, and the API helper `staffFromRequest(permission)` is in `lib/auth/admin.ts`. These are the plan's `requirePermission()`, so Phase 1 reuses them and doesn't add a new helper. The permission names and role grants match the brief exactly.
4. **Gap found.** `/admin/diagnostics` has no permission check of its own. Any staff role, including support and data_editor, can open it by URL; only the admin layout's staff and two-factor check applies. Its API (`/api/admin/sentry-test`) does require `settings`, so nothing can be triggered. Fix in Phase 1 with `requireStaff("settings")`; the route-coverage test will guard it.
5. Emailed reports: support can only **resend**. Deleting a report or blocking an address needs `users.erase`, so it's admin only. The brief lists "Block an address" without that limit.
6. Overview home: data editors already get their own home on `/admin` (`ContentHome`, their queues). Support has no home of its own and sees the Overview. Phase 1 adds only the support home.
7. Two-factor (aal2 via `getClaims`) and the 8-hour idle expiry (`proxy.ts`, cookie `sb-staff-seen`, for `/admin` and `/api/admin`) match the brief.

### Data

8. **affects plan.** `review_queue` columns are:
   - `id`, `table_name`, `record_id`, `proposed`, `current`, `reason`, `status` (pending, approved or rejected)
   - `source_text`, `reviewed_by`, `reviewed_at`, `published_programme_id`, `field_changes`, `created_at`, `updated_at`

   `reviewed_at` and per-field change tracking (`field_changes`) already exist. Phase 3 needs to add only `assignee_id`, `priority`, `critical_changes` and `rejection_reason` (see D8). Queue types today are `programme`, `city_cost` and `health_cover`. The queue holds 13 pending items: 12 city costs and 1 health cover.
9. **affects plan.** A `scholarship` table already exists and is used in matching (`lib/match/catalogue.ts`), with 4 rows. See D7.
10. **affects plan.** Programmes have a Master's-only `degree_type` enum (MSc, MA, MEng, MBA, MRes, MPH, LLM, MPS, Other). Phase 4 adds `level` alongside it. `university` already has `is_public` and `dli_number`; Phase 4's `institution_type` extends that table, with no rename.
11. `staff_audit` is append-only, through `refuse_audit_change()` triggers on update, delete and truncate. This matches the brief.
12. `activity_event` is append-only through `refuse_change()`. Deletes are allowed only for the retention job (`purge_activity_events`, after 24 months) and for test-account purges; anonymising is allowed only on erasure. **The retention purge runs inside the daily reminders cron**, which the brief doesn't say.
13. Activity events have one strict Zod schema each in `lib/activity/events.ts`. This matches the brief.
14. **affects plan.** The indexes the plan proposes already exist: `activity_event (event, occurred_at)`, `(actor_id, occurred_at)`, `(occurred_at)` and `(target_type, target_id)`. Drop those tasks from Phases 2 and 8.
15. **affects plan.** Settings are stored in `app_setting` (key → jsonb, `updated_by`, `updated_at`). See D9.

### Jobs and services

16. Crons (`vercel.json`): reminders at 07:00 UTC and FX at 06:00 UTC, logged in `cron_run`. This matches the brief. `pg_cron` isn't enabled; `pg_net` is.
17. The Python workers run locally only. `ingest/app.py` is FastAPI (`uvicorn`, port 8100) with `GET /health` and a token-protected `POST /runs`. There is no Dockerfile, Fly or Railway config, and no CI workflow for it. The only CI workflow is `advisor-eval.yml`.
18. AI tasks in `config/ai.json`:
    - extraction: `claude-haiku-5-5`
    - advisor: `gemini-3.6-flash`
    - explanations: `gemini-3.6-flash` (the brief doesn't list this task)

### Smaller points

19. Test counts are 421 Vitest tests and 174 Playwright tests; the brief says about 415 and about 170. The wizard has 6 steps, as the brief says.
20. Data note for Phase 3 coverage: UK regions are recorded inconsistently. Real universities use "London" and "North West", while demo rows use "London" and "Outside London".

## 3. Baseline (before the revamp)

How it was measured:
- 23 Nov 2026, production build (`next build` + `next start`) run locally on John's Windows laptop.
- Desktop Chrome at 1280×800, signed in as an admin with two-factor, against the one Supabase project.
- Median of 3 loads per page, browser cache warm.
- Data volumes are tiny (1 real account), so the times are mostly the server's round-trips to Supabase. They will grow with data.
- The temporary measuring script and its test account were deleted afterwards.

Column meanings:
- **First byte** is low because the page shell streams straight away.
- **Load** is when the streamed data has arrived.
- **JS** is the uncompressed size of the Next.js script files. The size on the wire is smaller.

| Page | First byte (ms) | Load (ms) | JS (KB) | JS files | HTML (KB) |
|---|---:|---:|---:|---:|---:|
| /admin (Overview) | 13 | 2,750 | 1,187 | 11 | 161 |
| /admin/users | 18 | 3,410 | 1,187 | 11 | 143 |
| /admin/emailed-reports | 19 | 2,961 | 1,189 | 12 | 137 |
| /admin/feedback | 39 | 1,722 | 1,187 | 11 | 139 |
| /admin/review | 17 | 2,814 | 1,190 | 12 | 160 |
| /admin/reports | 21 | 1,662 | 1,188 | 12 | 131 |
| /admin/visa-rules | 19 | 1,673 | 1,191 | 12 | 198 |
| /admin/fx | 20 | 1,584 | 1,190 | 12 | 164 |
| /admin/estimates | 18 | 1,085 | 1,191 | 12 | 136 |
| /admin/ai-usage | 35 | **3,526** | 1,187 | 11 | 210 |
| /admin/advisor | 21 | 3,175 | 1,187 | 11 | 140 |
| /admin/payments | 23 | 770 | 1,188 | 12 | 138 |
| /admin/settings | 16 | 700 | 1,192 | 12 | 146 |
| /admin/audit | 15 | 886 | 1,187 | 11 | 310 |
| /admin/system | 14 | 892 | 1,187 | 11 | 152 |
| /admin/diagnostics | 16 | 248 | 1,187 | 11 | 132 |

What this shows:
- **Slowest pages:** AI usage (3.5 s), Users (3.4 s), Advisor monitor (3.2 s) and Emailed reports (3.0 s). The Overview takes 2.75 s, so it is already over the 1.5 s target set for Phases 2 and 9.
- **JS size:** about 1.19 MB uncompressed, and the same on every admin page. Admin pages add almost nothing on top of the shared app code.
- **Student bundle:** Phase 0 did not measure whether admin code reaches student pages. That check belongs to Phase 1's acceptance criteria.

## Status

Phase 0 is done, and decisions D1–D9 were agreed on 23 Nov 2026. Phase 1 can start.
