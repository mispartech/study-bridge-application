-- Seed data from docs/SPEC_DATA.md. Safe to re-run:
--   visa_rule rows are inserted when not already present (same country, type, region, nationalities, start);
--   grade_mapping is inserted only when the table is empty;
--   demo rows (is_demo = true) are deleted and recreated.
-- Visa rules must be re-verified on the official page before launch (see spec "Seed notes").

begin;

-- ---------------------------------------------------------------------------
-- visa_rule (spec "Seed: visa_rule rows", as of 2026-11-01)
-- ---------------------------------------------------------------------------

-- Superseded by the two Proclamation 10998 rows below (docs/EXTRACTION.md section 6).
delete from public.visa_rule
where country = 'US' and rule_type = 'nationality_restriction'
  and applies_to_nationalities = '{NG,AO,BJ,BI,CI,GA,GM,MW,MR,SN,TZ,TG,ZM,ZW}';

insert into public.visa_rule
  (country, rule_type, applies_to_nationalities, applies_to_region, value, description,
   effective_from, effective_to, review_due, source_url, last_verified_at, confidence)
select v.country, v.rule_type, v.applies_to_nationalities, v.applies_to_region, v.value, v.description,
       v.effective_from, v.effective_to, v.review_due, v.source_url, timestamptz '2026-11-01 00:00:00+00', v.confidence
from (values
  ('UK'::public.country_code, 'proof_of_funds'::public.visa_rule_type, '{}'::public.iso_country[], 'London',
   '{"monthly_gbp":1529,"max_months":9,"total_gbp":13761}'::jsonb,
   'Living costs to show for study in London: £1,529 a month for up to 9 months (£13,761).',
   date '2025-11-11', date '2026-11-29', null::date, 'https://www.gov.uk/student-visa/money', 'official'::public.confidence_level),
  ('UK', 'proof_of_funds', '{}', 'London',
   '{"monthly_gbp":1570,"max_months":9,"total_gbp":14130}',
   'Living costs to show for study in London: £1,570 a month for up to 9 months (£14,130).',
   '2026-11-30', null, null, 'https://www.gov.uk/student-visa/money', 'official'),
  ('UK', 'proof_of_funds', '{}', 'Outside London',
   '{"monthly_gbp":1171,"max_months":9,"total_gbp":10539}',
   'Living costs to show for study outside London: £1,171 a month for up to 9 months (£10,539).',
   '2025-11-11', '2026-11-29', null, 'https://www.gov.uk/student-visa/money', 'official'),
  ('UK', 'proof_of_funds', '{}', 'Outside London',
   '{"monthly_gbp":1203,"max_months":9,"total_gbp":10827}',
   'Living costs to show for study outside London: £1,203 a month for up to 9 months (£10,827).',
   '2026-11-30', null, null, 'https://www.gov.uk/student-visa/money', 'official'),
  ('UK', 'funds_holding_period', '{}', null,
   '{"days":28}',
   'Funds must have been held for at least 28 consecutive days.',
   '2020-01-01', null, null, 'https://www.gov.uk/student-visa/money', 'official'),
  ('UK', 'post_study_work', '{}', null,
   '{"months":24}',
   'Graduate visa: 24 months after a non-PhD degree.',
   '2021-07-01', '2026-12-31', null, 'https://www.gov.uk/graduate-visa', 'official'),
  ('UK', 'post_study_work', '{}', null,
   '{"months":18,"phd_months":36}',
   'Graduate visa: 18 months after a non-PhD degree (36 months after a PhD).',
   '2027-01-01', null, null, 'https://www.gov.uk/graduate-visa', 'official'),
  ('CA', 'proof_of_funds', '{}', 'Outside Quebec',
   '{"single_cad":22895,"plus":"first-year tuition + travel"}',
   'Single applicant outside Quebec: CAD 22,895 plus first-year tuition and travel.',
   '2025-09-01', '2026-08-31', null,
   'https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/get-documents/financial-support.html', 'official'),
  ('CA', 'proof_of_funds', '{}', 'Outside Quebec',
   '{"single_cad":23448,"each_additional_family_member_cad":6318,"plus":"first-year tuition + travel"}',
   'Single applicant outside Quebec: CAD 23,448 (plus CAD 6,318 per additional family member), plus first-year tuition and travel.',
   '2026-09-01', null, null,
   'https://www.canada.ca/en/immigration-refugees-citizenship/services/study-canada/study-permit/get-documents/financial-support.html', 'official'),
  ('CA', 'proof_of_funds', '{}', 'Quebec',
   '{"single_cad":24617,"plus":"tuition + travel"}',
   'Single applicant in Quebec: CAD 24,617 plus tuition and travel.',
   '2026-01-01', null, null,
   'https://www.cicnews.com/2026/08/canada-hikes-funds-needed-by-study-permit-applicants-0879805.html', 'third_party'),
  ('CA', 'source_of_funds', '{}', null,
   '{"note":"officers assess origin of funds in all cases"}',
   'Visa officers assess where the funds came from in all cases.',
   '2026-07-01', null, null,
   'https://www.cicnews.com/2026/08/canada-hikes-funds-needed-by-study-permit-applicants-0879805.html', 'third_party'),
  ('CA', 'attestation_letter', '{}', null,
   '{"pal_required_for_masters_public_dli":false}',
   'No provincial attestation letter needed for a master''s at a public DLI.',
   '2026-01-01', null, null,
   'https://prodigyfinance.com/resources/blog/canada-study-permit-2026-cap-gic-standard-stream/', 'third_party'),
  -- Codes listed in the spec. TODO before launch: complete from Proclamation 10998 on travel.state.gov.
  ('US', 'nationality_restriction', '{AF,BF,MM,TD,CG,GQ,ER,HT,IR,LA,LY,ML,NE,SL,SO,SS,SD,SY,YE}', null,
   '{"suspended_visas":["F","M","J"],"exempt":"visas issued before 2026-01-01; nationals inside the US on that date"}',
   'Proclamation 10998 full suspension: F, M and J student visas are suspended (visas issued before 2026-01-01 and nationals inside the US on that date are exempt).',
   '2026-01-01', null, '2026-12-27',
   'https://www.whitehouse.gov/presidential-actions/2025/12/restricting-and-limiting-the-entry-of-foreign-nationals-to-protect-the-security-of-the-united-states/', 'official'),
  ('US', 'nationality_restriction', '{AO,AG,BJ,BI,CI,CU,DM,GA,GM,MW,MR,NG,SN,TZ,TG,TO,VE,ZM,ZW}', null,
   '{"suspended_visas":["F","M","J"],"exempt":"visas issued before 2026-01-01; nationals inside the US on that date"}',
   'Proclamation 10998 partial suspension: F, M and J student visas are suspended (visas issued before 2026-01-01 and nationals inside the US on that date are exempt).',
   '2026-01-01', null, '2026-12-27',
   'https://www.whitehouse.gov/presidential-actions/2025/12/restricting-and-limiting-the-entry-of-foreign-nationals-to-protect-the-security-of-the-united-states/', 'official'),
  ('US', 'length_of_stay', '{}', null,
   '{"max_admission_years":4,"replaces":"duration_of_status"}',
   'Students are admitted for a fixed period of up to 4 years, replacing duration of status.',
   '2026-09-15', null, null, 'https://www.mytravelready.ai/blog/us-student-visa-changes-2026', 'third_party'),
  ('US', 'government_fee', '{}', null,
   '{"sevis_usd":350,"mrv_usd":185,"visa_integrity_usd":250,"note":"confirm VIF collection status"}',
   'SEVIS fee USD 350, visa application (MRV) fee USD 185, visa integrity fee USD 250 (collection status to confirm).',
   '2025-10-01', null, null, 'https://tryalma.com/learn/f-1-student-visa', 'third_party'),
  ('US', 'processing_location', '{NG}', null,
   '{"routine_visa_post":"Lagos"}',
   'Routine visa applications from Nigeria are processed in Lagos.',
   '2026-08-01', null, null,
   'https://nairametrics.com/2026/09/15/us-tightens-f-1-visa-rules-introduces-four-year-admission-limit-cuts-grace-period-to-30-days/', 'third_party')
) as v(country, rule_type, applies_to_nationalities, applies_to_region, value, description,
       effective_from, effective_to, review_due, source_url, confidence)
where not exists (
  select 1 from public.visa_rule r
  where r.country = v.country and r.rule_type = v.rule_type
    and r.applies_to_region is not distinct from v.applies_to_region
    and r.applies_to_nationalities = v.applies_to_nationalities
    and r.effective_from = v.effective_from
);

-- Palestinian Authority travel documents are in the full-suspension group. PS is matched against
-- student_profile.travel_document, not nationality (docs/EXTRACTION.md section 6).
update public.visa_rule set applies_to_travel_documents = '{PS}'
where country = 'US' and rule_type = 'nationality_restriction' and 'AF' = any (applies_to_nationalities)
  and applies_to_travel_documents <> '{PS}';

-- Demo government fees for the cost engine. Placeholders, not verified: replace with sourced
-- rows before launch. (The US row above is the real seed.)
delete from public.visa_rule where is_demo;
insert into public.visa_rule
  (country, rule_type, value, description, effective_from, source_url, last_verified_at, confidence, is_demo)
values
  ('UK', 'government_fee', '{"visa_fee_gbp":524,"ihs_gbp_per_year":776}',
   'Demo figure: student visa fee and Immigration Health Surcharge.', '2025-01-01', 'internal:demo-data',
   timestamptz '2026-10-15 00:00:00+00', 'estimated', true),
  ('CA', 'government_fee', '{"study_permit_cad":150,"biometrics_cad":85}',
   'Demo figure: study permit and biometrics fees.', '2025-01-01', 'internal:demo-data',
   timestamptz '2026-10-15 00:00:00+00', 'estimated', true);

-- ---------------------------------------------------------------------------
-- grade_mapping (Nigerian CGPA → UK class), confidence = estimated
-- ---------------------------------------------------------------------------
insert into public.grade_mapping
  (scale, cgpa_min, cgpa_max, uk_class, gpa4_estimate, percent_estimate, source_url, last_verified_at, confidence)
select v.*, 'internal:docs/SPEC_DATA.md#seed-grade_mapping', timestamptz '2026-11-01 00:00:00+00', 'estimated'::public.confidence_level
from (values
  (5.0, 4.50, 5.00, 'first'::public.uk_class_band, 3.80, 75),
  (5.0, 3.50, 4.49, 'upper_second', 3.30, 65),
  (5.0, 2.40, 3.49, 'lower_second', 2.80, 55),
  (5.0, 1.50, 2.39, 'third', 2.20, 45),
  (4.0, 3.50, 4.00, 'first', 3.80, 75),
  (4.0, 3.00, 3.49, 'upper_second', 3.30, 65),
  (4.0, 2.00, 2.99, 'lower_second', 2.80, 55),
  (4.0, 1.00, 1.99, 'third', 2.20, 45)
) as v(scale, cgpa_min, cgpa_max, uk_class, gpa4_estimate, percent_estimate)
where not exists (select 1 from public.grade_mapping);

-- ---------------------------------------------------------------------------
-- Demo data: FAKE universities and programmes for development only.
-- Names start with "Demo —", domains use the reserved .example TLD, amounts are invented.
-- ---------------------------------------------------------------------------
delete from public.university where is_demo;
delete from public.city_cost where is_demo;
delete from public.cost_estimate where is_demo;
delete from public.scholarship where is_demo;
delete from public.fx_rate where is_demo;

create temp table demo_uni (
  name text, country public.country_code, city text, region text, domain text, sponsor boolean, sevp boolean, dli text
) on commit drop;

insert into demo_uni values
  ('Demo — Thamesbank University',          'UK', 'London',     'London',         'thamesbank-demo.example',   true,  false, null),
  ('Demo — Kingsgate College London',       'UK', 'London',     'London',         'kingsgate-demo.example',    true,  false, null),
  ('Demo — Riverside Metropolitan University', 'UK', 'London',  'London',         'riverside-demo.example',    true,  false, null),
  ('Demo — Northmoor University',           'UK', 'Manchester', 'Outside London', 'northmoor-demo.example',    true,  false, null),
  ('Demo — Pennine Institute of Technology', 'UK', 'Leeds',     'Outside London', 'pennine-demo.example',      true,  false, null),
  ('Demo — Clydeside University',           'UK', 'Glasgow',    'Outside London', 'clydeside-demo.example',    true,  false, null),
  ('Demo — Lakeshore University',           'CA', 'Toronto',    'Ontario',        'lakeshore-demo.example',    false, false, 'O000000000DEMO1'),
  ('Demo — Pacific Ridge University',       'CA', 'Vancouver',  'British Columbia', 'pacificridge-demo.example', false, false, 'O000000000DEMO2'),
  ('Demo — Université du Mont-Royal',       'CA', 'Montreal',   'Quebec',         'montroyal-demo.example',    false, false, 'O000000000DEMO3'),
  ('Demo — Atlantic Harbour University',    'CA', 'Halifax',    'Nova Scotia',    'atlanticharbour-demo.example', false, false, 'O000000000DEMO4'),
  ('Demo — Foothills University',           'CA', 'Calgary',    'Alberta',        'foothills-demo.example',    false, false, 'O000000000DEMO5'),
  ('Demo — Bayview Institute of Technology', 'US', 'Boston',    'Massachusetts',  'bayview-demo.example',      false, true,  null),
  ('Demo — Lone Prairie State University',  'US', 'Austin',     'Texas',          'loneprairie-demo.example',  false, true,  null),
  ('Demo — Lakefront University',           'US', 'Chicago',    'Illinois',       'lakefront-demo.example',    false, true,  null),
  ('Demo — Peachtree University',           'US', 'Atlanta',    'Georgia',        'peachtree-demo.example',    false, true,  null);

insert into public.university
  (name, country, city, region, is_public, dli_number, sponsor_licence, sevp_certified, ranking_band,
   intl_office_url, official_domains, source_url, last_verified_at, confidence, is_demo)
select name, country, city, region, true, dli, sponsor, sevp, null,
       'https://www.' || domain || '/international', array[domain],
       'https://www.' || domain || '/', timestamptz '2026-10-20 00:00:00+00', 'university_page', true
from demo_uni;

-- One row per programme. Amounts are whole units of the university's currency.
create temp table demo_prog (
  uni text, title text, degree public.degree_type, field public.field_code, months int,
  stem boolean, coop boolean, tuition int, app_fee int,
  min_class public.uk_class_band, ielts numeric, gre boolean, gmat boolean, work numeric,
  verified_days_ago int, jan_intake boolean
) on commit drop;

insert into demo_prog values
  -- UK, London (6)
  ('Demo — Thamesbank University', 'MSc Demo Data Science', 'MSc', 'computer_data_science', 12, false, false, 31500, 0, 'upper_second', 6.5, false, false, 0, 12, true),
  ('Demo — Thamesbank University', 'MSc Demo Global Public Health', 'MSc', 'public_health', 12, false, false, 27800, 0, 'upper_second', 7.0, false, false, 0, 30, false),
  ('Demo — Kingsgate College London', 'LLM Demo International Commercial Law', 'LLM', 'law', 12, false, false, 29900, 90, 'upper_second', 7.0, false, false, 0, 45, false),
  ('Demo — Kingsgate College London', 'MSc Demo Finance', 'MSc', 'business_finance', 12, false, false, 34500, 90, 'upper_second', 7.0, false, false, 0, 20, false),
  ('Demo — Riverside Metropolitan University', 'MSc Demo Project Management', 'MSc', 'project_management', 12, false, true, 18900, 0, 'lower_second', 6.0, false, false, 0, 8, true),
  ('Demo — Riverside Metropolitan University', 'MSc Demo Computer Science', 'MSc', 'computer_data_science', 12, false, true, 19500, 0, 'lower_second', 6.0, false, false, 0, 150, true),
  -- UK, outside London (6)
  ('Demo — Northmoor University', 'MSc Demo Artificial Intelligence', 'MSc', 'computer_data_science', 12, false, false, 28600, 0, 'upper_second', 6.5, false, false, 0, 15, false),
  ('Demo — Northmoor University', 'MBA Demo Global Business', 'MBA', 'business_finance', 12, false, false, 33000, 75, 'lower_second', 6.5, false, false, 3, 40, true),
  ('Demo — Pennine Institute of Technology', 'MEng Demo Civil Engineering', 'MEng', 'engineering', 12, false, true, 22400, 0, 'lower_second', 6.0, false, false, 0, 25, true),
  ('Demo — Pennine Institute of Technology', 'MSc Demo Public Health', 'MSc', 'public_health', 12, false, false, 20100, 0, 'lower_second', 6.5, false, false, 0, 60, true),
  ('Demo — Clydeside University', 'MSc Demo Construction Project Management', 'MSc', 'project_management', 12, false, false, 21300, 0, 'lower_second', 6.0, false, false, 0, 10, false),
  ('Demo — Clydeside University', 'LLM Demo Energy Law', 'LLM', 'law', 12, false, false, 23700, 0, 'upper_second', 6.5, false, false, 0, 100, false),
  -- Canada (10)
  ('Demo — Lakeshore University', 'MEng Demo Electrical Engineering', 'MEng', 'engineering', 16, false, true, 44200, 125, 'upper_second', 6.5, false, false, 0, 18, true),
  ('Demo — Lakeshore University', 'MPH Demo Population Health', 'MPH', 'public_health', 20, false, true, 38900, 125, 'upper_second', 7.0, false, false, 0, 35, false),
  ('Demo — Pacific Ridge University', 'MSc Demo Computer Science', 'MSc', 'computer_data_science', 24, false, false, 26300, 135, 'upper_second', 6.5, true, false, 0, 22, false),
  ('Demo — Pacific Ridge University', 'MBA Demo Sustainable Business', 'MBA', 'business_finance', 16, false, true, 52000, 150, 'lower_second', 7.0, false, true, 2, 14, true),
  ('Demo — Université du Mont-Royal', 'MSc Demo Applied Data Science', 'MSc', 'computer_data_science', 16, false, false, 29500, 110, 'upper_second', 6.5, false, false, 0, 50, true),
  ('Demo — Université du Mont-Royal', 'LLM Demo Comparative Law', 'LLM', 'law', 12, false, false, 24800, 110, 'upper_second', 7.0, false, false, 0, 70, false),
  ('Demo — Atlantic Harbour University', 'MEng Demo Ocean Engineering', 'MEng', 'engineering', 16, false, true, 23900, 100, 'lower_second', 6.5, false, false, 0, 28, true),
  ('Demo — Atlantic Harbour University', 'MPS Demo Project Management', 'MPS', 'project_management', 12, false, true, 21500, 100, 'lower_second', 6.5, false, false, 1, 9, true),
  ('Demo — Foothills University', 'MSc Demo Energy Engineering', 'MSc', 'engineering', 20, false, false, 27600, 145, 'upper_second', 6.5, true, false, 0, 150, false),
  ('Demo — Foothills University', 'MA Demo Health Policy', 'MA', 'public_health', 16, false, false, 22100, 145, 'upper_second', 7.0, false, false, 0, 33, false),
  -- USA (8)
  ('Demo — Bayview Institute of Technology', 'MS Demo Data Science', 'MSc', 'computer_data_science', 18, true, false, 61200, 100, 'upper_second', 7.0, true, false, 0, 11, false),
  ('Demo — Bayview Institute of Technology', 'MEng Demo Mechanical Engineering', 'MEng', 'engineering', 12, true, false, 58700, 100, 'upper_second', 7.0, true, false, 0, 26, false),
  ('Demo — Lone Prairie State University', 'MS Demo Computer Science', 'MSc', 'computer_data_science', 24, true, true, 36400, 75, 'upper_second', 6.5, true, false, 0, 19, true),
  ('Demo — Lone Prairie State University', 'MPH Demo Epidemiology', 'MPH', 'public_health', 24, true, false, 33800, 75, 'upper_second', 6.5, false, false, 0, 42, false),
  ('Demo — Lakefront University', 'MS Demo Finance', 'MSc', 'business_finance', 12, true, false, 55900, 90, 'upper_second', 7.0, false, true, 0, 16, false),
  ('Demo — Lakefront University', 'LLM Demo US Law for Foreign Lawyers', 'LLM', 'law', 9, false, false, 64500, 90, 'upper_second', 7.0, false, false, 0, 55, false),
  ('Demo — Peachtree University', 'MS Demo Project Management', 'MSc', 'project_management', 18, false, true, 31200, 65, 'lower_second', 6.5, false, false, 2, 7, true),
  ('Demo — Peachtree University', 'MBA Demo Healthcare Management', 'MBA', 'business_finance', 21, false, false, 47300, 65, 'lower_second', 6.5, false, true, 3, 120, true);

-- Expand programmes with their university and currency.
create temp table demo_full on commit drop as
select p.*, u.id as university_id, u.country, du.domain,
       case u.country when 'UK' then 'GBP' when 'CA' then 'CAD' else 'USD' end::public.currency_code as currency,
       timestamptz '2026-11-01 00:00:00+00' - make_interval(days => p.verified_days_ago) as verified_at,
       lower(regexp_replace(regexp_replace(p.title, '^\S+ Demo ', ''), '[^a-zA-Z0-9]+', '-', 'g')) as slug
from demo_prog p
join demo_uni du on du.name = p.uni
join public.university u on u.name = p.uni and u.is_demo;

insert into public.programme
  (university_id, title, degree_type, field, duration_months, study_mode, stem_designated, has_coop_or_placement,
   description, programme_url, apply_url, source_url, last_verified_at, confidence, is_demo)
select university_id, title, degree, field, months, 'full_time', stem, coop,
       'Demo programme for development. Not a real course.',
       'https://www.' || domain || '/courses/' || slug,
       'https://apply.' || domain || '/' || slug,
       'https://www.' || domain || '/courses/' || slug,
       verified_at, 'university_page', true
from demo_full;

-- Join key back to the inserted programme rows.
create temp table demo_ids on commit drop as
select f.*, pr.id as programme_id
from demo_full f
join public.programme pr on pr.university_id = f.university_id and pr.title = f.title and pr.is_demo;

insert into public.requirement
  (programme_id, min_uk_class, min_gpa4, nigeria_rule, considers_lower_with_experience, ielts_min, toefl_min, toefl_entries, duolingo_min, pte_min,
   waec_english_accepted, gre_status, gmat_status, min_work_years, documents,
   source_url, last_verified_at, confidence, is_demo)
select programme_id, min_class,
       case min_class when 'upper_second' then 3.00 else 2.70 end,
       case when country = 'UK' and min_class = 'upper_second'
            then 'Demo rule: CGPA 3.50/5.0 or 3.00/4.0 from a recognised Nigerian university.' end,
       work > 0 or min_class = 'upper_second',
       ielts, case when ielts >= 7 then 100 else 90 end,
       jsonb_build_array(jsonb_build_object('scale', '0-120', 'overall_min', case when ielts >= 7 then 100 else 90 end, 'subscore_min', null)),
       case when ielts >= 7 then 120 else 110 end,
       case when ielts >= 7 then 65 else 58 end,
       country = 'UK',
       case when gre then 'required' else 'not_required' end::public.test_status,
       case when gmat then 'required' else 'not_required' end::public.test_status,
       work,
       case when gmat then '{sop,references,cv,gmat}'::text[] else '{sop,references,cv}'::text[] end,
       'https://www.' || domain || '/courses/' || slug || '/entry-requirements', verified_at, 'university_page', true
from demo_ids;

insert into public.fee
  (programme_id, fee_year, tuition_per_year_minor, application_fee_minor, currency, source_url, last_verified_at, confidence, is_demo)
select programme_id, '2027/28', tuition::bigint * 100, app_fee::bigint * 100, currency,
       'https://www.' || domain || '/fees', verified_at, 'university_page', true
from demo_ids;

-- September 2027 for every programme, January 2028 where offered.
insert into public.intake
  (programme_id, start_term, cycle, start_month, application_opens, deadlines, deposit_minor, deposit_currency, deposit_deadline,
   source_url, last_verified_at, confidence, is_demo)
select programme_id, 'fall'::public.intake_term, '2027/28', date '2027-09-01', date '2026-10-01',
       jsonb_build_array(jsonb_build_object('label', 'international', 'date',
         case country when 'UK' then '2027-06-30' when 'CA' then '2027-01-31' else '2027-02-01' end)),
       least(tuition::bigint * 10, 5000) * 100, currency,
       case country when 'UK' then date '2027-07-31' when 'CA' then date '2027-05-01' else date '2027-05-01' end,
       'https://www.' || domain || '/courses/' || slug || '/apply', verified_at, 'university_page'::public.confidence_level, true
from demo_ids
union all
select programme_id, 'winter'::public.intake_term, '2027/28', date '2028-01-01', date '2027-03-01',
       jsonb_build_array(jsonb_build_object('label', 'international', 'date',
         case country when 'UK' then '2027-11-15' when 'CA' then '2027-08-31' else '2027-10-15' end)),
       least(tuition::bigint * 10, 5000) * 100, currency,
       date '2027-12-01',
       'https://www.' || domain || '/courses/' || slug || '/apply', verified_at, 'university_page'::public.confidence_level, true
from demo_ids where jan_intake;

-- Demo living costs per city: halls and shared flat. Whole units, converted to minor units.
insert into public.city_cost
  (country, city, accommodation_type, rent_monthly_low_minor, rent_monthly_high_minor, living_monthly_minor, currency,
   source_url, last_verified_at, confidence, is_demo)
select c.country, c.city, a.type, round(c.rent_low * a.factor) * 100, round(c.rent_high * a.factor) * 100, c.living * 100,
       case c.country when 'UK' then 'GBP' when 'CA' then 'CAD' else 'USD' end::public.currency_code,
       'internal:demo-data', timestamptz '2026-10-15 00:00:00+00', 'estimated', true
from (values
  ('UK'::public.country_code, 'London', 900, 1300, 450),
  ('UK', 'Manchester', 600, 850, 380),
  ('UK', 'Leeds', 550, 800, 370),
  ('UK', 'Glasgow', 550, 780, 370),
  ('CA', 'Toronto', 1100, 1600, 700),
  ('CA', 'Vancouver', 1200, 1700, 720),
  ('CA', 'Montreal', 800, 1150, 620),
  ('CA', 'Halifax', 750, 1050, 600),
  ('CA', 'Calgary', 850, 1200, 640),
  ('US', 'Boston', 1500, 2200, 800),
  ('US', 'Austin', 900, 1400, 650),
  ('US', 'Chicago', 1100, 1700, 700),
  ('US', 'Atlanta', 900, 1350, 650)
) as c(country, city, rent_low, rent_high, living)
cross join (values ('university_halls'::public.accommodation_type, 1.0), ('shared_flat', 0.8)) as a(type, factor);

-- Demo flat estimates. Placeholders, not verified.
insert into public.cost_estimate
  (country, item, amount_minor, currency, per_year, source_url, last_verified_at, confidence, is_demo)
values
  ('UK', 'flights', 70000, 'GBP', false, 'internal:demo-data', timestamptz '2026-10-15 00:00:00+00', 'estimated', true),
  ('CA', 'flights', 180000, 'CAD', false, 'internal:demo-data', timestamptz '2026-10-15 00:00:00+00', 'estimated', true),
  ('US', 'flights', 150000, 'USD', false, 'internal:demo-data', timestamptz '2026-10-15 00:00:00+00', 'estimated', true),
  ('CA', 'health_cover', 90000, 'CAD', true, 'internal:demo-data', timestamptz '2026-10-15 00:00:00+00', 'estimated', true),
  ('US', 'health_cover', 250000, 'USD', true, 'internal:demo-data', timestamptz '2026-10-15 00:00:00+00', 'estimated', true);

-- Demo scholarships, so the scholarship component has something to score.
insert into public.scholarship
  (name, funder, countries, fields, eligible_nationalities, min_uk_class, amount_minor, currency, coverage, deadline,
   url, source_url, last_verified_at, confidence, is_demo)
values
  ('Demo — Global Futures Scholarship', 'Demo Foundation', '{UK}', '{}', '{}', 'upper_second', 500000, 'GBP', 'partial',
   '2027-03-31', 'https://www.scholarship-demo.example/global-futures', 'https://www.scholarship-demo.example/global-futures',
   timestamptz '2026-10-20 00:00:00+00', 'estimated', true),
  ('Demo — Maple Graduate Award', 'Demo Foundation', '{CA}', '{computer_data_science,engineering}', '{}', 'lower_second', 800000, 'CAD', 'partial',
   '2027-02-28', 'https://www.scholarship-demo.example/maple', 'https://www.scholarship-demo.example/maple',
   timestamptz '2026-10-20 00:00:00+00', 'estimated', true),
  ('Demo — Africa Leaders Fund', 'Demo Foundation', '{UK,CA}', '{}', '{NG,GH,KE}', 'first', null, null, 'tuition',
   '2027-01-31', 'https://www.scholarship-demo.example/africa-leaders', 'https://www.scholarship-demo.example/africa-leaders',
   timestamptz '2026-10-20 00:00:00+00', 'estimated', true),
  ('Demo — Early Bird Grant', 'Demo Foundation', '{UK,CA}', '{}', '{}', null, 200000, 'GBP', 'partial',
   '2026-01-31', 'https://www.scholarship-demo.example/early-bird', 'https://www.scholarship-demo.example/early-bird',
   timestamptz '2026-10-20 00:00:00+00', 'estimated', true);

-- Demo FX: the latest dated rates found on 2026-11-04 (August-September 2026), not live. NGN per unit.
insert into public.fx_rate (base, quote, rate, rate_kind, fetched_at, source_url, is_demo) values
  ('GBP', 'NGN', 1943.98, 'official', '2026-08-08', 'https://techeconomy.ng/market-watch-naira-slides-to-n1487-01-after-n2-01-drop', true),
  ('USD', 'NGN', 1454.00, 'official', '2026-08-08', 'https://techeconomy.ng/market-watch-naira-slides-to-n1487-01-after-n2-01-drop', true),
  ('CAD', 'NGN', 1041.00, 'official', '2026-09-01', 'https://techeconomy.ng/naira-trades-at-n1490-in-parallel-market/', true),
  ('GBP', 'NGN', 2015.00, 'market', '2026-09-01', 'https://techeconomy.ng/naira-trades-at-n1490-in-parallel-market/', true),
  ('USD', 'NGN', 1490.00, 'market', '2026-09-01', 'https://techeconomy.ng/naira-trades-at-n1490-in-parallel-market/', true),
  ('CAD', 'NGN', 1130.00, 'market', '2026-09-01', 'https://techeconomy.ng/naira-trades-at-n1490-in-parallel-market/', true);

commit;
