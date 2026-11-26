# StudyBridge Version 1: pathways, Canadian colleges, funding and careers

Agreed 23 Nov 2026, from industry feedback (a Nigerian-trained accountant working in Canada) and John's direction.
It replaces Phases 4–6 of `docs/ADMIN_REVAMP_PLAN.md` and runs **before** admin Phases 2–3.

## The idea

StudyBridge is not only a Master's matcher. It maps a route **from school to career** based on what the student
wants to do after studying, such as:
- study only (the degree is the goal)
- build a corporate career
- start a business
- an academic or research career
- a licensed profession

The student says why they are moving, and the suggestions, roadmap and opportunities follow that goal.

**It works for every destination, not only Canada.** Pathways and signals are country-agnostic. Each signal is computed from that programme's own country records:
- the UK Graduate Route and the Canadian PGWP, both as visa rules
- UK and Canadian scholarships
- in-demand lists such as the UK Immigration Salary List and Canadian provincial lists
- UK and Canadian regulators

So a student on a UK academic route gets the same tailoring as one going to a Canadian college. New countries plug in by adding data.

**Nothing about this is hard-coded.**
- Goals, what each goal favours, and how strongly, are records that admins manage in the console.
- Students tick their own goals, and can change them, to get tailored results.
- Facts behind any suggestion (in-demand jobs, work permits, licensing, funding) come from the database with
  `source_url`, `last_verified_at` and `confidence`, and go through review like all other content.

## Decisions (23 Nov 2026)

| Question | Answer |
|---|---|
| Order | Steps A–F before admin Phases 2–3. |
| Audience for colleges | Degree holders first: postgraduate certificates and graduate diplomas. School-leaver diplomas later. |
| "Colleges have less funding and fewer requirements" | Read as lower fees and fewer entry requirements than universities; describe colleges that way. |
| First professions for licensing paths | Accounting, nursing, engineering. |
| Pilot provinces | Ontario and Nova Scotia, then British Columbia (decision D4). |

## Steps

### A. Check the rules (no code)
- **Do:**
  - Confirm on official IRCC and provincial pages:
    - the study permit cap and provincial attestation letters (PAL), and who needs one
    - post-graduation work permit (PGWP) eligibility: the field-of-study requirement, the language requirement, programme length, and excluded institutions
    - whether provincial and college funding is open to international students
  - Record each rule with its source and check date in `docs/CANADA_V1_SOURCES.md`.
- **Done when:** every rule the later steps depend on has an official link and a check date, and anything unconfirmed is marked unknown.

### B. Goals and pathways (the tailoring engine)
- **Data:**
  - `pathway`: key, label, description, active, display order, plus the standard content fields where it states facts.
  - `pathway_signal`: pathway → signal and weight. Admin-edited and audited.
  - Signals are named, documented inputs the scorer understands. Each is computed only from reviewed data:
    - field match
    - co-op or placement
    - post-study work rights
    - leads to a work permit (Step D)
    - in-demand occupation in the province (Step D)
    - licensing path available (Step E)
    - funding the student can get (Step C)
    - research-intensive
    - entrepreneurship support
    - cost
- **Student side:** onboarding's "Your goals" step asks "What do you want after you study?" (multi-select, from the active pathways). Results explain which goal shaped each score ("Ranked up for you: co-op placement, in-demand in Ontario").
- **Admin:** a Pathways page to add, edit, reorder and switch pathways on and off, and set each signal's weight. Every change is audited, and a preview shows how a sample profile's top results change.
- **Replaces:** the fixed career weights in `lib/match/score.ts`. With no goal chosen, results stay as today.
- **Done when:** the scorer has no goal-specific constants; changing a weight in the admin changes results without a deploy; tests cover several pathway mixes.

### C. College programmes
- **Data:**
  - `programme.level`: Master's, postgraduate certificate, graduate diploma; diploma later.
  - `university.institution_type`: university, public college, private college.
  - College requirement fields: prior degree, English, PAL, co-op, length in months, work-permit eligibility.
- **Review:** college programmes go through the existing review queue.
- **Student side:** onboarding asks "Master's, postgraduate certificate, or either?" Results label the level, so a certificate is never mistaken for a Master's.
- **Done when:** there are 20 reviewed programmes from 5 public colleges in Ontario and Nova Scotia, and students who want only Master's see no change.

### D. Funding
- **Data:** extend the existing `scholarship` table (decision D7) with type, `open_to_international` (yes / limited / no), levels, renewable, and % of tuition.
- **Student side:** a "Funded" chip, and the funding signal counts only funding the student can actually get.
- **Done when:** there are 10 reviewed funding records, and nothing without international eligibility is ever shown to a student; "limited" is labelled.

### E. Priority disciplines and work permits
- **Data:**
  - Occupations (NOC 2021) and each pilot province's demand: in-demand lists, provincial nominee streams, Job Bank outlooks.
  - The official PGWP field-of-study list.
  - Programme → occupation links: AI suggests, an editor approves.
- **Student side:** an "In demand in Ontario" chip and a "Leads to a work permit" note, each linked to its source. These feed the pathway signals, so they count only for students whose goals use them.
- **Done when:** 80% of pilot programmes are linked and reviewed, and no chip appears without a current, sourced record.

### F. Life after study: licensing, jobs, where to live, opportunities
- **Licensing paths:** accounting, nursing and engineering in each pilot province, with the regulator, steps, time and cost, and whether foreign credentials are assessed.
- **Per city:** job markets and rent areas.
- **Opportunities by pathway** (admin-managed, sourced):
  - communities and networks
  - entrepreneurship programmes
  - professional bodies
  - events
- **Student side:** a "Life after study" tab and a roadmap from school to career for the student's chosen goals. Both load on demand, to keep the slow-3G budget.
- **Done when:** each pilot profession has a reviewed path per province, each pilot city has 3 rent areas, and every item shows its source and freshness.

### Then
Admin Phases 2–3 (alerts, content hub), then 7–9.

## Rules that apply to every step
- Facts come only from the database: never hard-coded, never generated by AI at read time.
- Everything goes through review.
- Links are on allow-listed official domains.
- Money is stored in minor units and shown in NGN first.
- Visa rules stay hard filters.
- Admin pages check their permission on the server and audit every change (see `CLAUDE.md`).

## Status

- Step E: built 24 Nov 2026; data pending.
  - **Built:**
    - occupations (NOC 2021 and UK SOC 2020), demand by region, work-permit fields of study, and programme-to-occupation links
    - AI suggestions limited to occupations in the database; only links an editor approves are used
    - "In demand in ..." and "Leads to a work permit" chips linked to their source, "Careers this leads to" on the programme page, and both pathway signals
    - Admin pages: Careers and permits, Institutions
  - **Fails safe:** missing, unapproved, expired or over-120-day-old records count as unknown and show nothing.
  - **Before "Leads to a work permit" can show:** an editor adds `institution_check` (`"required"` or `"not_required"`) to each country's post-study work rule, marks institutions on the Institutions page, and, for college programmes, imports the eligible fields.
  - **Data still to enter:** occupations and demand for Ontario and Nova Scotia, the IRCC field list, and links for 80% of pilot programmes.
- Step D: built 24 Nov 2026; data pending.
  - **Built:**
    - the `scholarship` table, extended: funding type, international eligibility, when it's available (on admission or after classes start), automatic award, levels, regions, one institution, share of tuition, renewable
    - matching counts only funding that is stated as open to international students, available on admission, and matching the programme's institution, region and level
    - a "Funded" chip on results cards ("Funding (few international places)" when limited)
    - the pathway signal for funding follows the same rules
    - Admin → Content and data → Funding: add and edit records (saving marks them verified), deadlines highlighted, every change audited, and an institution's own funding must link to its official site
  - **Data still to enter:** 10 records from official pages. Records that don't state international eligibility stay hidden from students.
- Step C: code built 23 Nov 2026; 8 college programmes in review (Seneca, Centennial, NSCC).
  - **Built:**
    - programme `level` and `cip_code`; institution type; per-institution PGWP eligibility (unknown until checked, with source and date)
    - college entry by prior qualification
    - a "Master's / certificate / either" question in the deep search; Master's stays the default, so nothing changes for existing students
    - certificates labelled on results cards
    - work rights per programme, from the visa rule's own data (`non_degree`, `min_programme_months`)
    - the extractor and the approval path carry the new fields
  - **Before any college programme goes live:** an editor adds `"non_degree": "programme_length", "min_programme_months": 8` to Canada's post-study work rule, with the IRCC "About the PGWP" page as its source.
  - **Data still to collect:** 20 reviewed programmes from 5 public colleges. This needs extraction runs, which spend AI credit.
- Step B: built 23 Nov 2026:
  - pathways and weights in the database, managed at `/admin/pathways` with a preview
  - goals asked in the deep search
  - career fit follows the chosen goals, with the reasons shown on results cards
  - signals live now: course match, placement or co-op, work rights after study, funding
  - work-permit route, in-demand, licensing, research and founder support count once their data arrives (Steps C–F)
- Step A: done 23 Nov 2026. See `docs/CANADA_V1_SOURCES.md`, including the five points still to confirm before Step C.
