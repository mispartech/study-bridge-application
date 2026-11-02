# StudyBridge — Data Spec (Section 3 data model + visa rules + seeds)

Source: StudyBridge Product & Business Spec, as of 2026-11-01.
Purpose: input for prompt B2 (Supabase migrations, RLS, seed data). Save in the repo as `docs/SPEC_DATA.md`.

## Global conventions

- Postgres 17 + pgvector. Primary keys: `uuid` default `gen_random_uuid()`.
- Timestamps: `created_at`, `updated_at` (`timestamptz`, default `now()`) on every table.
- Money: `bigint` minor units (kobo, pence, cents) + `currency char(3)` (NGN, GBP, CAD, USD).
- Every CONTENT table (university, programme, requirement, intake, fee, city_cost, scholarship, visa_rule, grade_mapping) carries:
  - `source_url text not null`
  - `last_verified_at timestamptz not null`
  - `confidence confidence_level not null`
  - `is_demo boolean not null default false`
- Ranked results exclude records with `last_verified_at` older than 120 days.

## Enums

```sql
create type confidence_level as enum ('official', 'university_page', 'third_party', 'estimated');
create type country_code as enum ('UK', 'CA', 'US');
create type degree_type as enum ('MSc', 'MA', 'MEng', 'MBA', 'MRes', 'MPH', 'LLM', 'MPS', 'Other');
create type study_mode as enum ('full_time', 'part_time', 'online', 'blended');
create type uk_class_band as enum ('first', 'upper_second', 'lower_second', 'third', 'pass');
create type accommodation_type as enum ('university_halls', 'private_studio', 'shared_flat', 'homestay', 'off_campus_shared');
create type tracker_stage as enum ('researching', 'preparing_documents', 'applied', 'offer', 'deposit_paid', 'visa', 'enrolled', 'withdrawn');
create type visa_rule_type as enum ('proof_of_funds', 'funds_holding_period', 'post_study_work', 'nationality_restriction', 'length_of_stay', 'government_fee', 'attestation_letter', 'source_of_funds', 'processing_location');
create type field_code as enum ('computer_data_science', 'public_health', 'business_finance', 'engineering', 'project_management', 'law');
```

## Tables

### student_profile (user data; RLS: owner only)
| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| user_id | uuid fk auth.users unique | |
| nationality | char(2) | ISO 3166-1 alpha-2, e.g. NG |
| residence_country | char(2) | |
| degree_title | text | |
| institution_type | text | federal, state, private, polytechnic |
| degree_class | uk_class_band null | as stated by student |
| cgpa | numeric(4,2) null | |
| cgpa_scale | numeric(3,1) null | 5.0 or 4.0 |
| field | field_code | |
| graduation_year | int | |
| work_years | numeric(3,1) | default 0 |
| ielts / toefl / duolingo / gre / gmat | numeric null each | overall scores |
| english_medium_degree | boolean | for waivers |
| budget_total_minor | bigint | NGN minor units |
| tuition_cap_minor | bigint null | NGN |
| funding_source | text | self, sponsor, scholarship, loan, mixed |
| intake_target | date | first day of target month |
| preferred_countries | country_code[] | |
| preferred_cities | text[] | |
| accommodation_pref | accommodation_type null | |
| dependants | int | default 0 |
| career_goal | text null | |
| weights | jsonb | default `{"A":30,"B":25,"C":15,"L":10,"S":10,"O":10}` |
| completeness | int | 0-100 |

### university
| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| name | text | |
| country | country_code | |
| city | text | |
| region | text | UK: 'London' or 'Outside London'; CA: province; US: state |
| is_public | boolean | |
| dli_number | text null | Canada only |
| sponsor_licence | boolean | UK: on Register of Student Sponsors |
| sevp_certified | boolean | US |
| ranking_band | text null | e.g. 'top_100', '101_300' |
| intl_office_url | text | |
| official_domains | text[] | allow-list for apply links |
| + content columns | | |

### programme
| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| university_id | uuid fk | |
| title | text | |
| degree_type | degree_type | |
| field | field_code | |
| duration_months | int | |
| study_mode | study_mode | |
| stem_designated | boolean | US STEM OPT |
| has_coop_or_placement | boolean | |
| description | text | |
| embedding | vector(1024) | semantic search |
| programme_url | text | |
| apply_url | text | must match university.official_domains |
| + content columns | | |

### requirement (1:1 with programme)
| column | type | notes |
| --- | --- | --- |
| programme_id | uuid pk fk | |
| min_uk_class | uk_class_band | |
| min_gpa4 | numeric(3,2) null | |
| nigeria_rule | text null | verbatim from university's Nigeria page |
| considers_lower_with_experience | boolean | |
| ielts_min / toefl_min / duolingo_min | numeric null | overall |
| english_subscores | jsonb null | |
| english_waiver_text | text null | |
| waec_english_accepted | boolean | |
| gre_required / gmat_required | boolean | |
| min_work_years | numeric(3,1) | default 0 |
| documents | text[] | sop, references, cv, portfolio |
| + content columns | | |

### intake
| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| programme_id | uuid fk | |
| start_month | date | |
| application_opens | date null | |
| deadlines | jsonb | `[{"label":"international","date":"2027-06-30"}]` |
| scholarship_deadline | date null | |
| deposit_minor / deposit_currency | bigint / char(3) | |
| deposit_deadline | date null | |
| + content columns | | |

### fee
| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| programme_id | uuid fk | |
| fee_year | text | e.g. '2027/28' |
| tuition_per_year_minor | bigint | international rate |
| application_fee_minor | bigint | |
| currency | char(3) | |
| + content columns | | |

### city_cost
| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| country / city | country_code / text | |
| accommodation_type | accommodation_type | |
| rent_monthly_low_minor / rent_monthly_high_minor | bigint | |
| living_monthly_minor | bigint | food, transport, phone |
| currency | char(3) | |
| + content columns | | |

### scholarship
| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| name / funder | text | |
| countries | country_code[] | |
| fields | field_code[] | empty = all |
| eligible_nationalities | char(2)[] | empty = all |
| min_uk_class | uk_class_band null | |
| amount_minor / currency | bigint null / char(3) | |
| coverage | text | full, tuition, partial, stipend |
| deadline | date null | |
| url | text | |
| + content columns | | |

### visa_rule
| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| country | country_code | |
| rule_type | visa_rule_type | |
| applies_to_nationalities | char(2)[] | empty = everyone |
| applies_to_region | text null | e.g. 'London', 'Quebec' |
| value | jsonb | structured value (see seed) |
| description | text | human-readable |
| effective_from | date | |
| effective_to | date null | null = current |
| review_due | date null | e.g. US 180-day review |
| + content columns | | |

### grade_mapping
| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| scale | numeric(3,1) | 5.0 or 4.0 |
| cgpa_min / cgpa_max | numeric(4,2) | |
| uk_class | uk_class_band | |
| gpa4_estimate | numeric(3,2) | |
| percent_estimate | int | |
| + content columns | | |

### fx_rate
| column | type | notes |
| --- | --- | --- |
| id | uuid pk | |
| base / quote | char(3) | e.g. GBP / NGN |
| rate | numeric(14,4) | |
| rate_kind | text | 'official' or 'market' |
| fetched_at | timestamptz | |

### shortlist (RLS: owner only)
`id, student_id fk, programme_id fk, created_at` — unique (student_id, programme_id); max 15 for free users (enforce in API).

### application_tracker (RLS: owner only)
`id, student_id fk, programme_id fk, stage tracker_stage, checklist jsonb, next_reminder_at timestamptz, notes text`

### source_audit
`id, table_name text, record_id uuid, source_url text, fetched_at timestamptz, content_hash text, change_detected boolean, diff jsonb, verified_by text null, approved_at timestamptz null`

### review_queue (for B3)
`id, table_name, record_id, proposed jsonb, current jsonb, reason text, status text ('pending','approved','rejected'), created_at`

## RLS summary
- `student_profile`, `shortlist`, `application_tracker`: select/insert/update/delete only where `user_id = auth.uid()` (via student_profile).
- All content tables, `fx_rate`: select for `anon` and `authenticated`; writes only by `service_role`.
- `source_audit`, `review_queue`: service_role only.

## Seed: visa_rule rows (verify each on the official page before launch)

| country | rule_type | region / nationality | value (jsonb) | effective_from | effective_to | source_url |
| --- | --- | --- | --- | --- | --- | --- |
| UK | proof_of_funds | London | `{"monthly_gbp":1529,"max_months":9,"total_gbp":13761}` | 2025-11-11 | 2026-11-29 | https://www.gov.uk/student-visa/money |
| UK | proof_of_funds | London | `{"monthly_gbp":1570,"max_months":9,"total_gbp":14130}` | 2026-11-30 | null | https://www.gov.uk/student-visa/money |
| UK | proof_of_funds | Outside London | `{"monthly_gbp":1171,"max_months":9,"total_gbp":10539}` | 2025-11-11 | 2026-11-29 | https://www.gov.uk/student-visa/money |
| UK | proof_of_funds | Outside London | `{"monthly_gbp":1203,"max_months":9,"total_gbp":10827}` | 2026-11-30 | null | https://www.gov.uk/student-visa/money |
| UK | funds_holding_period | all | `{"days":28}` | 2020-01-01 | null | https://www.gov.uk/student-visa/money |
| UK | post_study_work | all (non-PhD) | `{"months":24}` | 2021-07-01 | 2026-12-31 | https://www.gov.uk/graduate-visa |
| UK | post_study_work | all (non-PhD) | `{"months":18,"phd_months":36}` | 2027-01-01 | null | https://www.gov.uk/graduate-visa |
| CA | proof_of_funds | outside Quebec | `{"single_cad":22895,"plus":"first-year tuition + travel"}` | 2025-09-01 | 2026-08-31 | https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/get-documents/financial-support.html |
| CA | proof_of_funds | outside Quebec | `{"single_cad":23448,"each_additional_family_member_cad":6318,"plus":"first-year tuition + travel"}` | 2026-09-01 | null | https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/get-documents/financial-support.html |
| CA | proof_of_funds | Quebec | `{"single_cad":24617,"plus":"tuition + travel"}` | 2026-01-01 | null | https://www.cicnews.com/2026/08/canada-hikes-funds-needed-by-study-permit-applicants-0879805.html |
| CA | source_of_funds | all | `{"note":"officers assess origin of funds in all cases"}` | 2026-07-01 | null | https://www.cicnews.com/2026/08/canada-hikes-funds-needed-by-study-permit-applicants-0879805.html |
| CA | attestation_letter | all | `{"pal_required_for_masters_public_dli":false}` | 2026-01-01 | null | https://prodigyfinance.com/resources/blog/canada-study-permit-2026-cap-gic-standard-stream/ |
| US | nationality_restriction | NG, AO, BJ, BI, CI, GA, GM, MW, MR, SN, TZ, TG, ZM, ZW (+ others in Proclamation 10998) | `{"suspended_visas":["F","M","J"],"exempt":"visas issued before 2026-01-01"}` | 2026-01-01 | null (review_due every 180 days) | https://travel.state.gov |
| US | length_of_stay | all | `{"max_admission_years":4,"replaces":"duration_of_status"}` | 2026-09-15 | null | https://www.mytravelready.ai/blog/us-student-visa-changes-2026 |
| US | government_fee | all | `{"sevis_usd":350,"mrv_usd":185,"visa_integrity_usd":250,"note":"confirm VIF collection status"}` | 2025-10-01 | null | https://tryalma.com/learn/f-1-student-visa |
| US | processing_location | NG | `{"routine_visa_post":"Lagos"}` | 2026-08-01 | null | https://nairametrics.com/2026/09/15/us-tightens-f-1-visa-rules-introduces-four-year-admission-limit-cuts-grace-period-to-30-days/ |

Seed notes:
- Set `confidence = 'official'` for gov.uk / canada.ca / travel.state.gov rows, `'third_party'` for the rest, and replace third-party URLs with official ones before launch.
- The US nationality list: confirm the full Proclamation 10998 partial-restriction list on travel.state.gov and store ISO codes.
- Dates marked as early as 2020/2021/2025 for older rules are placeholders for "already in force"; only current rows are used by the matcher.

## Seed: grade_mapping (Nigerian CGPA → UK class), confidence = 'estimated'

| scale | cgpa_min | cgpa_max | uk_class | gpa4_estimate | percent_estimate |
| --- | --- | --- | --- | --- | --- |
| 5.0 | 4.50 | 5.00 | first | 3.80 | 75 |
| 5.0 | 3.50 | 4.49 | upper_second | 3.30 | 65 |
| 5.0 | 2.40 | 3.49 | lower_second | 2.80 | 55 |
| 5.0 | 1.50 | 2.39 | third | 2.20 | 45 |
| 4.0 | 3.50 | 4.00 | first | 3.80 | 75 |
| 4.0 | 3.00 | 3.49 | upper_second | 3.30 | 65 |
| 4.0 | 2.00 | 2.99 | lower_second | 2.80 | 55 |
| 4.0 | 1.00 | 1.99 | third | 2.20 | 45 |

A university's published Nigeria rule (requirement.nigeria_rule) always overrides this table.

## Seed: demo programmes
30 realistic but clearly FAKE programmes with `is_demo = true` and names prefixed "Demo —": 12 UK (6 London, 6 outside), 10 Canada (mix of provinces, public), 8 US. Spread across all 6 field codes and fee bands, with intakes in Sep 2027 and Jan 2028.