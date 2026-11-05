# StudyBridge — B4/B5 spec (matching rules, onboarding, brand and UI)

Save in the repo as `docs/SPEC_B4.md`. Extracted from the StudyBridge Product & Business Spec (sections 5, 6 and 7),
updated with every decision made during B2 and B3. Where this file and the original spec differ, this file wins.

---

## 1. Matching and scoring (spec section 6)

Ranking is deterministic code, so it is fast, testable and explainable. The AI layer only writes explanations
(prompt R2) and handles conversational refinement in the advisor (B6).

### Stage 1: hard filters (fail = excluded from ranked results)

| Filter | Rule |
| --- | --- |
| Visa eligibility | No current `visa_rule` of type `nationality_restriction` for the programme's country lists the student's nationality. Restricted programmes go to a separate "Restricted for your nationality" list with the reason, never into ranked results. The `PS` row matches a travel-document field, not nationality. |
| Field | The programme's field equals the student's. With the "related fields" option on, closely related programmes count too (`computer_data_science` includes AI and analytics programmes coded under another field). No field chosen yet = no filter. |
| Academic minimum | Student band ≥ `requirement.min_uk_class` (or `min_gpa4`). If `considers_lower_with_experience` is true, one band below passes when `profile.work_years ≥ 2`, and the programme is grouped as Reach. A university's `nigeria_rule` overrides the `grade_mapping` estimate. |
| English | Pass if ANY of: (a) an IELTS/Duolingo/PTE score ≥ that test's minimum; (b) a TOEFL score ≥ the minimum **on the same scale as the student's result** (`requirement.toefl_entries[].scale`: "0-120" or "1-6"); (c) the student qualifies for the published waiver (`waec_english_accepted` with the student's grade at or above `waec_min_grade`, or `english_medium_degree` where the waiver text allows it). No stated grade means no WAEC waiver. Planned-but-not-taken English tests do not pass this filter; show the programme as "Needs English test" in a separate state instead. |
| Admission tests | Uses `gre_status` / `gmat_status`. A `required` test must be held or in `profile.tests_planned`. If both are `one_of_required`, holding or planning either one passes. `optional` and `not_required` never exclude. Null = unknown: pass, but show "Check test requirement". |
| Budget ceiling | Total first-year cost (section 3 of this file) ≤ `budget_total` × 1.15. |
| Intake | The programme has an intake in the student's target cycle (e.g. 2027/28 = Sep 2027, Jan 2028, May 2028). An intake with `start_term` and null `start_month` matches on cycle + term. At least one deadline for that intake is still in the future. |
| Data freshness | Every record used (programme, requirement, intake, fee) verified within 120 days. |
| Demo data | `is_demo` records only appear when `NEXT_PUBLIC_DEMO_MODE=true`. |

### Stage 2: weighted fit score (0–100)

Fit = 30·A + 25·B + 15·C + 10·L + 10·S + 10·O, each component scored 0–1. Weights come from `profile.weights`
(defaults below) and must sum to 100.

| Component | What it measures | Default weight |
| --- | --- | --- |
| A: Academic fit | Headroom above the minimum: 1.0 two bands above, 0.8 one above, 0.6 at the minimum, 0.3 for a Reach | 30 |
| B: Budget fit | 1.0 at ≤ 70% of budget, falling linearly to 0 at 115% | 25 |
| C: Career fit | Exact field match 0.6, + 0.2 for STEM designation (US) or co-op/placement, + 0.2 for longest post-study work in the student's preferred countries | 15 |
| L: Location fit | 1.0 if city in `preferred_cities`, 0.6 if in a preferred country/region, + availability of the chosen accommodation type in `city_cost` | 10 |
| S: Scholarship potential | Open scholarships the student is eligible for, scaled by amount (cap 1.0 at ≥ 50% of tuition) | 10 |
| O: Outcomes | Ranking band and graduate earnings where data exists; 0.5 when unknown | 10 |

### Stage 3: grouping, diversity and explanation

- **Strong match:** fit ≥ 75 and within budget. **Good match:** 55–74, or stretch budget (100–115%). **Reach:** academic band one below the minimum, or fit < 55.
- Diversity: no more than 4 programmes from one university in the top 20; at least 2 countries when the student selected more than one.
- Near misses: when fewer than 3 programmes rank, return up to 5 nearest over-budget programmes that pass every other filter, as a separate `near_misses` list with the NGN gap and eligible scholarships.
- Explanations: send the top 20 as JSON to prompt R2 through the AI adapter; return `{programme_id, why, watch_out}`. Cache by `(programme_id, profile_bucket)`; regenerate only when the programme record changes. Results render immediately; explanations stream in after.

### Required tests (Vitest, 40+ cases), including

- A Nigerian national never sees US programmes in ranked results; they appear in the restricted list.
- Budget at exactly 115% passes; 115.01% fails.
- An expired deadline excludes the intake; a stale record (> 120 days) excludes the programme.
- GRE/GMAT: GMAT-only, GRE-only, neither, both, planned-only, `one_of_required`, `required` + `one_of_required` mix.
- TOEFL: student result on 0–120 vs a 1–6 minimum is compared on the student's own scale only.
- Term-only intake (fall, null month) matches a 2027/28 target.
- Diversity caps hold with 10 programmes from one demo university.

### Worked example

A 2:1 (CGPA 3.8 / 5.0) Computer Science graduate from Lagos, ₦80m budget, IELTS 7.0, target Sep 2027, self-catered room in halls.
On the 41 demo programmes, the 4 US computing programmes go to the restricted list. Results lean to Canadian public universities
with co-op (the top match is a Halifax MSc at ₦47.2m) and one-year UK MSc programmes outside London (Glasgow ₦64.9m, Leeds ₦68.4m).
London options appear as Stretch once the London maintenance figure is added (₦83.8m).

₦40m is below the realistic one-year cost for the UK and Canada: tuition, rent, living costs, visa and flights together
come to more. At ₦40m nothing ranks, and the 5 nearest programmes appear as near misses with the NGN gap and eligible
scholarships; the closest is ₦7.2m over budget.

---

## 2. Onboarding and profile (spec F1, F2)

### F1. Six-step wizard

1. **Who you are:** nationality, country of residence, travel document (passport country).
2. **Academics:** degree title, institution type (federal, state, private, polytechnic), degree class, CGPA and scale (5.0 / 4.0), field, graduation year, years of work experience.
3. **Tests:** for each of IELTS, TOEFL (with scale), Duolingo, PTE, GRE, GMAT: "taken" (score), "planned", or "not taking". Planned tests go to `tests_planned`. English-medium degree yes/no; WAEC/NECO English grade.
4. **Budget:** total available (savings + sponsor) in NGN, optional tuition ceiling, funding source. "I don't know yet" allowed: default to a band and mark the profile incomplete.
5. **Preferences:** countries, cities or regions, campus vs city life, accommodation type, target cycle and term.
6. **Goals:** career goal, post-study work priority, dependants.

Logic: each step autosaves; progress survives refresh; "I don't know yet" allowed for tests and budget.
Completeness (0–100) drives a "match confidence" label on results.
Acceptance: median completion under 5 minutes on a mid-range Android phone over 3G; one-handed use; 44 px tap targets.

### F2. Academic normalisation

Map degree class / CGPA + scale to a band (First, 2:1, 2:2, Third), a 4.0 GPA estimate and a percentage estimate using
`grade_mapping`. Use the university's `nigeria_rule` when present (source = official); otherwise source = estimated,
always labelled in the UI. HND + PGD is its own pathway: treat as one band below the stated class unless the
university states otherwise.

---

## 3. Cost engine (spec F3)

- **Total first-year cost** = tuition (first year; full-time international) + living (city_cost for the chosen accommodation × months, max 12) + visa and health (UK visa fee + Immigration Health Surcharge; Canada study permit fee + insurance; US SEVIS + visa fees + insurance) + application fee + deposit (if not part of tuition) + flights (flat estimate per country, stored as a config row).
- **Visa proof-of-funds figure:** UK = outstanding first-year tuition + maintenance (London / outside London, ≤ 9 months, from the current `visa_rule`); Canada = first-year tuition + current single-applicant amount (+ family members) + travel; US = the I-20 cost of attendance where known.
- Visa fee, health cover and flights come back flagged `estimated` until they are confirmed from a government or university source, so the UI can label them.
- Show in source currency and in NGN at both `fx_rate` kinds (official, market).
- Affordability: Within budget (≤ 100%), Stretch (100–115%), Out of reach (> 115%).
- Visa rules are picked by `effective_from` ≤ the student's expected visa application date (≈ 3 months before intake start), so the UK increase on 30 Nov 2026 and the Graduate Route change on 1 Jan 2027 apply correctly.
- Every number is tappable to its breakdown and source; changing accommodation updates the total in under 200 ms.

---

## 4. Brand and UI/UX system (spec section 7)

The brand feels like a smart older sibling who already studied abroad: confident, warm, honest about money.
Modern and calm, with one energetic accent. Mobile-first for Android phones on patchy data.

### Identity
- Name: StudyBridge (working). Tagline: "Your Master's abroad, matched to your grades and your budget."
- Voice: plain English, naira-first, never hype. Say "This is ₦6.2m over your budget", not "Oops!".
- Logo idea: a simple arch whose span becomes an upward path; works as a 24 px icon.

### Colour tokens

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| ink | #15132B | #F4F3FA | Text, headings |
| canvas | #F8F7FC | #0E0D1A | Page background |
| surface | #FFFFFF | #181629 | Cards, sheets |
| primary | #5B4CF5 | #8B80FF | Buttons, links, focus |
| accent | #FF7A59 | #FF9478 | The one hero element per screen |
| success | #12B886 | #38D9A9 | Within budget, strong match |
| warning | #F59F00 | #FFC233 | Stretch budget, deadline under 14 days |
| danger | #F03E5E | #FF6B81 | Out of reach, visa restricted |
| muted | #6E6A85 | #A6A2BD | Secondary text |

### Typography, shape, motion
- Headings: Plus Jakarta Sans 600–700. Body: Inter 400–500 with tabular numerals for all money.
- Scale 32 / 24 / 20 / 16 / 14 / 12 px; body line height 1.5.
- Radius: 16 px cards, 12 px buttons, pill chips. Soft shadows only on lifted cards. 8 px grid.
- Motion: Framer Motion, 180–240 ms ease-out; results reorder with a layout animation when filters change; respect reduced motion.

### Signature components
- **Match card:** university crest, programme, city, fit ring (0–100), total cost in NGN with budget chip (green / amber / red), next deadline, Save and Apply.
- **Budget gauge:** horizontal bar of the student's budget with each programme's total as a marker; drag to change budget and watch results update (250 ms debounce).
- **Cost breakdown sheet:** bottom sheet with stacked segments (tuition, rent, living, visa, flights) and a currency toggle (NGN, GBP, CAD, USD).
- **Freshness badge:** "Verified 12 days ago" with source link; amber after 90 days.
- **Visa status chip:** "Open", "Restricted for your nationality", or "Rules changing 1 Jan 2027", with a tap-through explanation.
- **Deadline timeline:** horizontal scroll of saved deadlines with countdowns.
- **Advisor chat:** bubbles that embed live programme cards and a "Show sources" toggle.

### Key screens (MVP)
1. Landing page with a 3-question quick match (field, CGPA, budget) showing 3 real results before sign-up.
2. Onboarding wizard (6 steps, progress ring).
3. Results: list and compare views, filter rail (country, city, fee band, intake, no-GRE, co-op, scholarships), sort, weight sliders, Restricted tab.
4. Programme detail.
5. Advisor chat (full screen on mobile, side panel on desktop).
6. My plan: shortlist, tracker, document checklist, deadline timeline.
7. Cost calculator (stand-alone, shareable with a sponsor).
8. Settings and data controls.

### Experience rules
- Show value before sign-up; ask for an account only to save.
- Every money figure is tappable for its breakdown and source.
- Low-data mode: no autoplay media, compressed crests, first screen under 200 KB.
- WCAG 2.2 AA contrast, 44 px minimum tap targets, full keyboard support on desktop.