# StudyBridge — Value-first access, emailed reports, and admin system

Save in the repo as `docs/SPEC_ACCESS_ADMIN.md`. It overrides earlier specs where they differ.
In particular it replaces "ask for sign-up when finishing the wizard" (B6) and expands the "minimum admin console" step.

---

## 1. Principle: value before account

A student gets their full results before we ask for anything. An account is offered as a convenience
("keep this, get reminders, use the advisor"), never as a gate to the core answer.

| Feature | Anonymous visitor | Emailed report (one-time) | Account |
| --- | --- | --- | --- |
| Quick match (4 questions) | Yes | — | Yes |
| Full 6-step wizard | Yes (stored in the browser) | — | Yes (stored in DB) |
| Full results: Ranked, Closest options, Restricted, cost breakdowns, apply links | Yes | Snapshot in the email | Yes, live |
| Match explanations (R2) | Yes (cached; rate-limited) | Included | Yes |
| Programme detail and compare | Yes | — | Yes |
| Email me my report | Yes | — | Yes |
| Save shortlist across devices, tracker, document checklist | No: "Create a free account to keep this" | No | Yes |
| Deadline and change reminders | No | Only if they tick "send me reminders" | Yes |
| Advisor chat | 2 messages per device per day, behind a bot check | No | 5/day free, unlimited Plus |
| Plus payment | No | No | Yes |

Rules:
- Sign-up prompts appear only at natural moments: saving a programme, opening the tracker, the 3rd advisor message, after the email report is sent. Never as a modal before results.
- Everything an anonymous visitor does is kept in the browser and moved into the account if they sign up (already built in B6; keep it).
- Abuse protection for anonymous use: Cloudflare Turnstile (invisible) on quick match, the email report and anonymous advisor; rate limits per IP and per device (match: 30/hour; email report: 3/day per IP, 2/day per email address; advisor: 2/day).

---

## 2. Email me my report (one-time use)

### Flow
1. On the results page, a sticky bar: "Email me this report". Fields: email, and two separate unticked checkboxes:
   - "Send me deadline reminders for these programmes" (reminders consent)
   - "Send me occasional scholarship and study-abroad updates" (marketing consent)
   Plus the line: "We use your email to send this report. Privacy notice." (link)
2. Turnstile check, rate limit, then store a `report` record and send the email via Resend.
3. The email contains the formatted report plus a PDF attachment, and a button "View and update your results".
4. That button is a signed magic link. Clicking it signs the student in with that email (passwordless). So a one-time user becomes an account holder with one click, with no password and no separate sign-up form. The report's profile and results are attached to the new account.
5. If they never click, nothing else is created: the report record is the only thing we keep.

### Report contents (email HTML + PDF, same layout, brand tokens from section 4 of SPEC_B4.md)
1. Header: StudyBridge logo, "Your Master's options — prepared on {date}", and a line: "Prices and rules as of {date}. Always confirm on the university's site."
2. Your profile in one block: field, grade (with "estimated" label if from grade_mapping), English test, budget in NGN, countries, intake.
3. Summary line: "9 programmes fit your budget. The strongest is X at ₦47.2m."
4. Top matches (up to 10): programme, university, city, fit score, group, total first-year cost in NGN and local currency, budget status, next deadline, why it fits (R2), watch-out, official apply link, "verified N days ago".
5. Closest options (if any): gap in NGN and scholarships that would help.
6. Restricted for your nationality (if any): one line each with the reason.
7. Money you'll need to show for the visa: proof-of-funds figure per top country, with the source link.
8. Your deadline timeline: next 6 deadlines in date order.
9. Scholarships you may qualify for.
10. Next steps checklist: tests to book, documents to prepare, dates.
11. Footer: what "estimated" means, how to report an error, unsubscribe link, privacy notice, company contact.

Email rules: works in Gmail on Android with images off (text first, images optional); under 100 KB HTML; PDF under 1 MB; plain-text alternative included.

### Data stored
`report`: id, email (lowercased), email_hash, profile_snapshot (jsonb), results_snapshot (jsonb, including prices and the FX rate used), reminders_consent, marketing_consent, consent_text_version, created_at, sent_at, delivery_status, opened_at (only if open tracking is consented), claimed_user_id (set when the magic link is used), expires_at.
- Retention: delete unclaimed reports after 12 months, or immediately on unsubscribe-and-delete.
- Reminders for unclaimed reports use the snapshot's programmes, with every reminder re-checking the live record first.

---

## 3. Roles and authentication

### Current state (as of B6)
- Students: Supabase Auth with email magic link and Google; consent screen; browser data moved into the account; RLS tested. Production still needs: Site URL and redirects, Google client ID/secret, custom SMTP. Google sign-in and real email delivery have not been tested end to end.
- Admins: no role, no admin sign-in rules and no admin console exist yet.

### Roles
| Role | Can do |
| --- | --- |
| student | Own profile, shortlist, tracker, reports, advisor |
| support | Read users and activity (not advisor text unless flagged), resend reports, suspend accounts |
| data_editor | Review queue, programmes, error reports, visa rules |
| admin | Everything, including roles, payments, deletions and settings |

- Roles live in Supabase `app_metadata.role` (students can't change it) and are checked in RLS policies and in every server route, never only in the UI.
- Staff accounts must use Google sign-in or magic link **plus TOTP two-factor (MFA)**. Admin routes refuse a session without MFA level aal2.
- First admin is created by a one-off script, not through the app. No self-service way to become staff.
- Staff sessions expire after 8 hours of inactivity.

---

## 4. Activity tracking

One append-only table, `activity_event`:
id, occurred_at, actor_type (anonymous, student, staff, system), actor_id (user id or anonymous device id), session_id, event, target_type, target_id, properties (jsonb, no free text from users), ip_hash, user_agent_family.

Rules: no update or delete permissions for anyone except the scheduled retention job; personal data in properties is forbidden (validated by schema per event); retention 24 months; anonymous events only after analytics consent (same rule as PostHog).

### Student events (how they act on suggestions)
quick_match_run, wizard_step_completed, results_viewed, filter_changed, programme_viewed, explanation_viewed, programme_saved, programme_dismissed (with reason: too expensive, wrong field, wrong city, already applied, other), suggestion_feedback (helpful / not relevant), compare_used, apply_clicked, report_emailed, report_link_opened, account_created (with source: report, save, advisor, direct), tracker_stage_changed, document_checked, reminder_sent, reminder_clicked, advisor_message (counts only), advisor_guard_triggered, advisor_thumbs (up/down + reason), plus_checkout_started, plus_paid, error_reported, account_deleted.

Add to the UI: a "Not for me" button with a reason on every match card, and a thumbs up/down on explanations and advisor answers. These signals improve matching and are the base for the later talent and scholarship ecosystem.

### Staff events (audit log)
Every staff action is logged with before/after values: user_viewed, user_suspended, user_deleted, role_changed, report_resent, record_approved, record_edited, record_rejected, visa_rule_changed, advisor_conversation_opened (with a required reason), refund_issued, export_downloaded, setting_changed. The audit view is read-only and filterable; admins can't delete audit entries.

---

## 5. Admin console (/admin)

Mobile-usable but designed for desktop. Same brand tokens. Every page has date-range filters and CSV export (export itself is audited).

1. **Overview dashboard**
   - Funnel: visitors → quick match → wizard complete → results viewed → (report emailed | account created) → saved → apply clicked → Plus paid. Show conversion between each step.
   - Today / 7 days / 30 days: new accounts, emailed reports, report-to-account claims, apply clicks, Plus revenue, advisor messages and AI cost, guard triggers, error reports, open review-queue items.
   - Top programmes by saves and by "Not for me" (with reasons), top countries and fields requested, budget distribution in NGN bands.
2. **Users**
   - Search by email, name or id; filters: role, status, country of residence, field, has Plus, created date, last active.
   - User page: profile, shortlist, tracker, reports sent, consents with dates, activity timeline, payments.
   - Actions: suspend/unsuspend, resend magic link, resend report, change role (admin only), export user data, delete user (NDPA erasure: removes profile, shortlist, tracker, reports; anonymises activity).
   - No impersonation. A read-only "view their results" panel instead, logged in the audit trail.
3. **Reports (one-time users)**
   - List of emailed reports: date, email, delivery status, opened, claimed, consents. Resend, delete, block an address.
   - Metric: % of reports claimed into accounts.
4. **Suggestions and feedback**
   - Per programme: impressions, saves, dismisses by reason, apply clicks, average fit score shown.
   - Explanation and advisor thumbs-down list with reasons; drill into the specific result (advisor text only with reason logged).
5. **Content**
   - Review queue (approve / edit / reject, source page side by side), error reports from students, programmes, scholarships, visa rules editor (effective dates, sources), freshness overview (records nearing 120 days).
6. **Advisor monitor**
   - Messages per day, cost per day by model, guard triggers by type, eval results history, conversations flagged by guard or thumbs-down.
7. **Payments**
   - Paystack transactions, status, refunds (admin only, audited).
8. **System**
   - Cron and ingestion runs with status, email delivery stats (Resend), recent server errors (link to Sentry), environment health (missing env vars by name only, never values).
9. **Audit log**
   - All staff events, filterable by staff member, action and date.

---

## 6. Long-term ecosystem (design now, build later)

The goal is a journey from study to work: explore → apply → study → graduate → work. Nothing below is built in the MVP,
but today's data model must not block it:

- One person record keyed by email across reports, accounts and later products.
- Consent stored per purpose with versioned text: report, reminders, marketing, and later "share my profile with employers" and "share with universities". Never reuse one consent for another purpose.
- Career fields already captured (career goal, industry, post-study work priority) stay on the profile.
- Later phases (see roadmap V2–V3): scholarship hub with eligibility and alerts, post-study work routes by country and field, alumni mentors, employer and talent-market profiles (opt-in only), and partner APIs.

---

## 7. Build order

1. Value-first access changes (section 1) and abuse protection.
2. Email report flow, report email/PDF, magic-link claim (section 2).
3. Roles, MFA for staff, first-admin script (section 3).
4. activity_event, audit log, "Not for me" and thumbs feedback (section 4).
5. Admin console pages in order: Overview, Users, Reports, Content, Audit, Suggestions, Advisor, Payments, System (section 5).

Tests for every step: RLS and role tests (a student can't reach any /admin route or admin API; support can't change roles; data_editor can't see users), MFA enforcement, rate limits, Turnstile, report email rendering (snapshot test), magic-link claim attaches the report, erasure removes everything listed.
