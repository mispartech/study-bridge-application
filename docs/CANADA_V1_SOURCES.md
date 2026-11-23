# Canada Version 1: rules checked against official sources

Step A of `docs/CANADA_V1_PLAN.md`.
- **Checked:** 23 Nov 2026, on official Government of Canada (IRCC) and institution pages.
- **"Page date"** is the date the page itself shows ("Page details").
- **Status:**
  - **Confirmed:** stated on the official page.
  - **Inferred:** follows from the page's wording, but isn't stated outright.
  - **Unknown:** not found; never assume it.

**These rules shape the data model; they are never hard-coded.** Each becomes a `visa_rule` (or similar) record with `source_url`, `last_verified_at` and `confidence`, entered and reviewed in the admin. IRCC changes these rules often (several changed in 2024–2026), so each record needs re-checking at least every 90 days.

## 1. Provincial or territorial attestation letter (PAL/TAL)

| Rule | Status | Source |
|---|---|---|
| A PAL/TAL is "usually required to apply for a study permit". | Confirmed | [PAL page](https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/get-documents/provincial-attestation-letter.html), page date 2026-09-02 |
| Exempt from 1 Jan 2026: "degree-granting graduate program at the master's or doctoral level at a public DLI". | Confirmed | same |
| Master's at a **private** institution is not covered by that exemption. | Inferred (the exemption says "public") | same |
| College postgraduate certificates and graduate diplomas need a PAL: they are not on the exemption list. | Inferred | same |
| A 2026 PAL/TAL is valid until 31 Dec 2026 and must be issued in 2026. | Confirmed | same |
| Quebec: students need a CAQ attestation, even most of those exempt from a PAL. | Confirmed | same |
| 2026 cap: 180,000 for applicants who need a PAL/TAL; exempt master's and doctoral students counted separately (49,000). | Confirmed (search summary of the notice; re-read before using the numbers) | [2026 allocations notice](https://www.canada.ca/en/immigration-refugees-citizenship/news/notices/2026-provincial-territorial-allocations-under-international-student-cap.html) |

**Model:** `pal_required` per programme, from level and institution type, recorded as a visa rule with its source. Show PAL as a step in the student's plan for college programmes.

## 2. Post-graduation work permit (PGWP): eligibility

| Rule | Status | Source |
|---|---|---|
| The programme must be "at least 8 months long" (900 hours in Quebec), studied full time (part time allowed in the final semester only). | Confirmed | [Who can apply](https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/work/after-graduation/eligibility.html), page date 2026-06-24 |
| **Language, from 1 Nov 2024:** degree graduates (bachelor's, master's, doctoral) and "any other university program" need CLB 7 in all four abilities; "college, polytechnic or non-university" graduates need CLB 5. | Confirmed | same |
| Accepted tests: IELTS General Training, CELPIP General, PTE Core (and TEF/TCF Canada for French). Results under 2 years old; tests taken in person. | Confirmed | [Get the right documents](https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/work/after-graduation/get-documents.html), page date 2026-06-24 |
| IELTS General Training minimums: CLB 7 = 6.0 in each ability; CLB 5 = reading 4.0, writing 5.0, listening 5.0, speaking 5.0. | Confirmed | [Language results](https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/work/after-graduation/eligibility/language-results.html), page date 2026-05-27 |
| The **IELTS Academic** test many students take for admission is **not** an accepted PGWP test. | Inferred (only General Training is listed) | Get the right documents |
| **Field of study:** for study permit applications from 1 Nov 2024, graduates must be in an eligible field, checked by the programme's 6-digit CIP code. Bachelor's, master's and doctoral graduates are exempt. | Confirmed | [Field of study](https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/work/after-graduation/eligibility/field-of-study.html) |
| The code must be on the eligible list when the student applies for the study permit **or** for the PGWP. | Confirmed | same |
| "For 2026, we won't add or remove any eligible fields of study." | Confirmed | same |
| Eligible fields fall into these categories: agriculture and agri-food, education, health care and social services, STEM, trades, transport. | Confirmed (category list from the CIP pages) | [Currently eligible CIP codes](https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/work/after-graduation/eligibility/field-of-study/currently-eligible.html) |
| A **college postgraduate certificate** counts as a "college program": CLB 5, and the field-of-study rule applies. | Inferred (it is neither a degree nor a university programme) | Who can apply. **Confirm with a pilot college's PGWP page** (for example [Conestoga's PGWP-aligned programs](https://www.conestogac.on.ca/international/apply-to-conestoga/pgwp-aligned-programs)) before relying on it. |
| **Curriculum licensing (public–private partnership) programmes:** "not PGWP-eligible in most cases". Only same-province programmes started on or before 15 May 2024, or between-province ones started on or before 31 Jan 2023, can qualify. | Confirmed | Who can apply |
| Also excluded: programmes at a DLI that isn't PGWP-eligible, non-credit programmes, ESL/FSL, general-interest courses, and programmes more than 50% online. | Confirmed | same |

**Model:**
- `programme.cip_code`.
- `pgwp_eligible`, computed from reviewed records:
  - the institution's PGWP eligibility, recorded per institution with its source
  - not a curriculum-licensing campus
  - length of at least 8 months
  - field on the eligible list (a reviewed `pgwp_field` table, re-checked yearly)
- The student's English level checked against CLB 5 or 7 by test.

This is the "Leads to a work permit" signal (plan step E).

## 3. How long the PGWP lasts

| Rule | Status | Source |
|---|---|---|
| Length depends on programme level and length, capped by passport expiry. | Confirmed | [About the PGWP](https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/work/after-graduation/about.html), page date 2026-03-09 |
| Master's (from 15 Feb 2024): up to 3 years even if the programme was under 2 years (minimum 8 months). This "doesn't apply to certificate or diploma programs." | Confirmed | same |
| Other programmes of 8 months to under 2 years: up to the programme's length (a 9-month course gives up to 9 months). | Confirmed | same |
| Programmes of 2 years or more: up to 3 years. | Confirmed | same |
| Two eligible programmes can be combined, meeting the higher language level. Only one PGWP per lifetime. | Confirmed | same |
| Time studied outside Canada (on or after 1 Sept 2024) is deducted. | Confirmed | Who can apply |

**Model:** `post_study_work` months per programme, derived from level and length under these rules. Today `careerFit` uses one months value per country, so this becomes per-programme. It matters most for comparing a 1-year graduate certificate (about 1 year of work rights) with a 1-year Master's (up to 3 years). Students should see that difference.

## 4. Spouse or partner work permits (affects students with dependants)

| Rule | Status | Source |
|---|---|---|
| From 21 Jan 2025, a student's spouse can get an open work permit only if the student is in a master's programme of 16 months or longer, a doctorate, or certain eligible or professional programmes. | Confirmed (search summary of the official page; re-read the full list of eligible programmes before modelling) | [Help your spouse work in Canada](https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/work/help-your-spouse-common-law-partner-work-canada.html) |
| College certificates and Master's shorter than 16 months don't give the spouse a work permit. | Inferred from the above | same |

**Model:** a visa rule. For students with `dependants > 0` or a spouse, show whether the spouse could work, and (if the admin sets it as a signal) let it affect ranking.

## 5. Proof of funds

| Rule | Status | Source |
|---|---|---|
| A single applicant needs CAD 23,448 a year for living costs (outside Quebec), on top of tuition and travel, for applications from 1 Sept 2026. | Confirmed (search summary; read the table before entering it) | [Proof of financial support](https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/get-documents/financial-support.html) |

**Model:** already a `proof_of_funds` visa rule type. Check the stored value matches the 1 Sept 2026 figure.

## 6. Funding open to international students

| Finding | Status | Source |
|---|---|---|
| **NSCC (Nova Scotia):** awards are open to international students "unless otherwise stated", but international applicants **can't** apply for any award that assesses financial need. Some named awards (for example the Sobey Award) exclude them. NSCC's guide says international students must be ready to cover most of their costs and usually become eligible for awards only after starting classes. | Confirmed | [NSCC Student Awards Policy](https://www.nscc.ca/about/publications/policies-procedures/policies/student-awards-policy.asp), [Sobey Award](https://www.nscc.ca/admissions/financial-support/student-awards/awards-for-prospective-students/sobey-award/index.asp) |
| **Ontario colleges:** some offer automatic international entrance scholarships (Sheridan; Humber, for some intakes and mostly students already in Canada). Seneca has a CAD 2,000 award on its internationally educated nurses programme. Terms change each intake. | Confirmed per college, but **must be re-checked per intake** | [Sheridan](https://www.sheridancollege.ca/admissions/international), [Humber](https://humber.ca/study-at-humber/pay-fees/scholarships-bursaries), [Seneca](https://www.senecapolytechnic.ca/programs/partnerships/TNC/admission-requirements.html) |
| **Ontario Graduate Scholarship (OGS), for university Master's and doctorates:** a limited number of places for international students with a study permit; A- average; recently CAD 5,000 a term for 2–3 terms (University of Toronto). | Confirmed for U of T; other universities set their own | [U of T SGS: OGS](https://www.sgs.utoronto.ca/awards/ontario-graduate-scholarship/) |
| Provincial government funding for international college students in Ontario or Nova Scotia. | **Unknown**: none found | — |

**What this means:** the accountant's point stands for colleges being cheaper with simpler entry. But funding for international students is mostly small entrance awards, or awards available only after starting. Funding records must state `open_to_international` (yes / limited / no) and when the student becomes eligible (on admission, or after starting). "Funded" should mean money the student can count on before arriving.

## Still to confirm before Step C

1. That a public college postgraduate certificate is classed as a "college program" for the PGWP (CLB 5 and field of study), on a pilot college's own PGWP page.
2. The full list of programmes that give a spouse an open work permit.
3. The proof-of-funds table itself, not a summary.
4. Each pilot college's PGWP eligibility, and that none is a curriculum-licensing campus.
5. Off-campus work-hour limits during study (not checked yet).
