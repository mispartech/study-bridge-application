# StudyBridge — remaining build and runtime prompts (spec section 9)

Save in the repo as `docs/PROMPTS.md`. Copied from section 9 of the StudyBridge Product & Business Spec.
Where `docs/SPEC_B4.md` differs, SPEC_B4.md wins. Run one build prompt at a time.

---

## B5. Onboarding, results and programme pages

```text
Build the student-facing flow with the design system from B1:
- Landing page with a 3-question quick match (field, CGPA, budget in NGN) that calls /api/match and shows 3 live results
  before sign-up.
- 6-step onboarding wizard (spec F1), autosaving each step, with a progress ring and friendly microcopy.
- Results page: list and compare views, filter rail, weight sliders, and a draggable Budget Gauge that re-runs ranking
  with a 250ms debounce and animates reordering (Framer Motion layout).
- Match card and programme detail page exactly as specified in section 7, every money value tappable to a
  Cost Breakdown bottom sheet with a currency toggle.
- Visa-restricted programmes go to a separate tab with an explanation, never into the ranked list.
Test on a 360px viewport with network throttled to Slow 3G and fix anything over 3s to first result.
```

Programme detail page contents (spec F6): overview, entry rules (with Nigeria rule if any), English and test
requirements, fees and total cost, intakes and deadlines, scholarships, post-study work, city and accommodation,
freshness badge, and an "Apply on university site" button. Every apply link must be on an official domain
(allow-list check).

Compare view (spec F8): up to 3 programmes side by side; must work on a 360 px screen.

---

## B6. Advisor agent

```text
Implement the advisor chat at /advisor with streaming and tool use, through the AI adapter (/config/ai.json "advisor").
Tools (server-side, each returning DB records with source_url and last_verified_at):
search_programmes(filters), get_programme(id), cost_breakdown(programme_id, accommodation), find_scholarships(profile),
get_visa_rules(country, nationality), compare_programmes(ids[]), add_to_shortlist(programme_id).
Use the system prompt in R1 verbatim, injecting the student profile JSON and current shortlist.
Render programme cards inline when a tool returns programmes. Add a "Show sources" toggle.
Free users get 5 messages per day; Plus users are unlimited. Enforce server-side.
Build an eval set of 200 student questions with expected tool calls and forbidden behaviours
(invented fees, legal advice, non-official links); run it in CI and fail below 95% pass.
```

---

## B7. Plan, alerts, payments and analytics

```text
Build: the My Plan page (shortlist, tracker stages, per-programme document checklist, deadline timeline);
Resend email reminders at 30/14/3 days and on record changes; Paystack checkout for StudyBridge Plus with webhook
verification; PostHog events for every funnel step (landing_quick_match, onboarding_step_n, results_viewed,
programme_saved, apply_clicked, plus_checkout_started, plus_paid); settings page with data export and delete.
```

Tracker stages (spec F8): Researching, Preparing documents, Applied, Offer, Deposit paid, Visa, Enrolled.
Shortlist: up to 15 programmes free. Alerts (spec F9): a change detected by ingestion reaches affected users within 24 hours.

---

## R1. Advisor system prompt (runtime, used by B6)

```text
You are StudyBridge Advisor, a study-abroad guide for students from Nigeria and other African countries who want a
Master's degree in the UK, Canada or the USA.

Student profile: {{profile_json}}
Current shortlist: {{shortlist_json}}
Today's date: {{today}}

How you work:
- Get every fact (fees, deadlines, entry requirements, scholarships, visa rules, links) by calling tools. Never state a
  number, date or link that is not in a tool result. If the data is missing or older than 120 days, say so plainly.
- Always respect the student's nationality: if a country restricts visas for them, say so first and suggest open options.
- Show money in NGN first, then the local currency. Mention the visa proof-of-funds figure when discussing affordability.
- Be honest about reach options and budget gaps. Suggest concrete ways to close gaps (cheaper city, scholarship,
  one-year UK MSc, co-op in Canada).
- Give apply links only from tool results, and only to official university or government sites.
- You are not an immigration lawyer. For legal or visa-decision questions, explain the published rule from the tool and
  link the official page.
- Keep answers short: lead with the answer, then up to 3 programme cards or bullet points. Warm, plain English.
- Never recommend a programme because it is sponsored. Sponsored items are labelled by the app, not by you.
```

## R2. Match explanation prompt (already in /prompts from B4)

## R3. Extraction prompt (already in docs/EXTRACTION.md from B3)