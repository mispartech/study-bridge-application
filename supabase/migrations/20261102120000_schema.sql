-- StudyBridge schema (docs/SPEC_DATA.md, section 3).
-- Money is bigint minor units + ISO currency code. Content tables carry provenance columns.

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.confidence_level as enum ('official', 'university_page', 'third_party', 'estimated');
create type public.country_code as enum ('UK', 'CA', 'US');
create type public.degree_type as enum ('MSc', 'MA', 'MEng', 'MBA', 'MRes', 'MPH', 'LLM', 'MPS', 'Other');
create type public.study_mode as enum ('full_time', 'part_time', 'online', 'blended');
create type public.uk_class_band as enum ('first', 'upper_second', 'lower_second', 'third', 'pass');
create type public.accommodation_type as enum ('university_halls', 'private_studio', 'shared_flat', 'homestay', 'off_campus_shared');
create type public.tracker_stage as enum ('researching', 'preparing_documents', 'applied', 'offer', 'deposit_paid', 'visa', 'enrolled', 'withdrawn');
create type public.visa_rule_type as enum ('proof_of_funds', 'funds_holding_period', 'post_study_work', 'nationality_restriction', 'length_of_stay', 'government_fee', 'attestation_letter', 'source_of_funds', 'processing_location');
create type public.field_code as enum ('computer_data_science', 'public_health', 'business_finance', 'engineering', 'project_management', 'law');

-- ---------------------------------------------------------------------------
-- Domains and helpers
-- ---------------------------------------------------------------------------
create domain public.currency_code as char(3) check (value in ('NGN', 'GBP', 'CAD', 'USD'));
create domain public.iso_country as char(2) check (value ~ '^[A-Z]{2}$');

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- User data
-- ---------------------------------------------------------------------------
create table public.student_profile (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  nationality public.iso_country,
  residence_country public.iso_country,
  degree_title text,
  institution_type text check (institution_type in ('federal', 'state', 'private', 'polytechnic')),
  degree_class public.uk_class_band,
  cgpa numeric(4,2) check (cgpa >= 0),
  cgpa_scale numeric(3,1) check (cgpa_scale in (4.0, 5.0)),
  field public.field_code,
  graduation_year int check (graduation_year between 1950 and 2100),
  work_years numeric(3,1) not null default 0 check (work_years >= 0),
  ielts numeric(3,1) check (ielts between 0 and 9),
  toefl numeric(4,1) check (toefl between 0 and 120),
  duolingo numeric(4,1) check (duolingo between 10 and 160),
  gre numeric(4,1) check (gre between 260 and 340),
  gmat numeric(4,1) check (gmat between 200 and 805),
  english_medium_degree boolean not null default false,
  budget_total_minor bigint check (budget_total_minor >= 0),
  tuition_cap_minor bigint check (tuition_cap_minor >= 0),
  funding_source text check (funding_source in ('self', 'sponsor', 'scholarship', 'loan', 'mixed')),
  intake_target date check (intake_target = date_trunc('month', intake_target)::date),
  preferred_countries public.country_code[] not null default '{}',
  preferred_cities text[] not null default '{}',
  accommodation_pref public.accommodation_type,
  dependants int not null default 0 check (dependants >= 0),
  career_goal text,
  weights jsonb not null default '{"A":30,"B":25,"C":15,"L":10,"S":10,"O":10}',
  completeness int not null default 0 check (completeness between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cgpa is null or cgpa_scale is not null and cgpa <= cgpa_scale)
);
comment on column public.student_profile.budget_total_minor is 'Total budget in NGN minor units (kobo).';
comment on column public.student_profile.tuition_cap_minor is 'Tuition cap in NGN minor units (kobo).';

-- ---------------------------------------------------------------------------
-- Content tables. Every row records where the fact came from and how fresh it is.
-- ---------------------------------------------------------------------------
create table public.university (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country public.country_code not null,
  city text not null,
  region text not null,
  is_public boolean not null,
  dli_number text,
  sponsor_licence boolean not null default false,
  sevp_certified boolean not null default false,
  ranking_band text,
  intl_office_url text not null,
  official_domains text[] not null check (cardinality(official_domains) > 0),
  source_url text not null,
  last_verified_at timestamptz not null,
  confidence public.confidence_level not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (dli_number is null or country = 'CA')
);
comment on column public.university.official_domains is 'Allow-list for apply links: apply_url host must equal one of these or be a subdomain.';

create table public.programme (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.university (id) on delete cascade,
  title text not null,
  degree_type public.degree_type not null,
  field public.field_code not null,
  duration_months int not null check (duration_months between 1 and 60),
  study_mode public.study_mode not null default 'full_time',
  stem_designated boolean not null default false,
  has_coop_or_placement boolean not null default false,
  description text not null default '',
  embedding extensions.vector(1024),
  programme_url text not null,
  apply_url text not null,
  source_url text not null,
  last_verified_at timestamptz not null,
  confidence public.confidence_level not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.requirement (
  programme_id uuid primary key references public.programme (id) on delete cascade,
  min_uk_class public.uk_class_band not null,
  min_gpa4 numeric(3,2) check (min_gpa4 between 0 and 4),
  nigeria_rule text,
  considers_lower_with_experience boolean not null default false,
  ielts_min numeric(3,1) check (ielts_min between 0 and 9),
  toefl_min numeric(4,1) check (toefl_min between 0 and 120),
  duolingo_min numeric(4,1) check (duolingo_min between 10 and 160),
  english_subscores jsonb,
  english_waiver_text text,
  waec_english_accepted boolean not null default false,
  gre_required boolean not null default false,
  gmat_required boolean not null default false,
  min_work_years numeric(3,1) not null default 0 check (min_work_years >= 0),
  documents text[] not null default '{}',
  source_url text not null,
  last_verified_at timestamptz not null,
  confidence public.confidence_level not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.intake (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.programme (id) on delete cascade,
  start_month date not null check (start_month = date_trunc('month', start_month)::date),
  application_opens date,
  deadlines jsonb not null default '[]' check (jsonb_typeof(deadlines) = 'array'),
  scholarship_deadline date,
  deposit_minor bigint check (deposit_minor >= 0),
  deposit_currency public.currency_code,
  deposit_deadline date,
  source_url text not null,
  last_verified_at timestamptz not null,
  confidence public.confidence_level not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (programme_id, start_month),
  check ((deposit_minor is null) = (deposit_currency is null))
);

create table public.fee (
  id uuid primary key default gen_random_uuid(),
  programme_id uuid not null references public.programme (id) on delete cascade,
  fee_year text not null check (fee_year ~ '^\d{4}/\d{2}$'),
  tuition_per_year_minor bigint not null check (tuition_per_year_minor >= 0),
  application_fee_minor bigint not null default 0 check (application_fee_minor >= 0),
  currency public.currency_code not null,
  source_url text not null,
  last_verified_at timestamptz not null,
  confidence public.confidence_level not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (programme_id, fee_year)
);

create table public.city_cost (
  id uuid primary key default gen_random_uuid(),
  country public.country_code not null,
  city text not null,
  accommodation_type public.accommodation_type not null,
  rent_monthly_low_minor bigint not null check (rent_monthly_low_minor >= 0),
  rent_monthly_high_minor bigint not null,
  living_monthly_minor bigint not null check (living_monthly_minor >= 0),
  currency public.currency_code not null,
  source_url text not null,
  last_verified_at timestamptz not null,
  confidence public.confidence_level not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (country, city, accommodation_type, is_demo),
  check (rent_monthly_high_minor >= rent_monthly_low_minor)
);

create table public.scholarship (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  funder text not null,
  countries public.country_code[] not null default '{}',
  fields public.field_code[] not null default '{}',
  eligible_nationalities public.iso_country[] not null default '{}',
  min_uk_class public.uk_class_band,
  amount_minor bigint check (amount_minor >= 0),
  currency public.currency_code,
  coverage text not null check (coverage in ('full', 'tuition', 'partial', 'stipend')),
  deadline date,
  url text not null,
  source_url text not null,
  last_verified_at timestamptz not null,
  confidence public.confidence_level not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((amount_minor is null) = (currency is null))
);
comment on column public.scholarship.fields is 'Empty array = all fields.';
comment on column public.scholarship.eligible_nationalities is 'Empty array = all nationalities.';

create table public.visa_rule (
  id uuid primary key default gen_random_uuid(),
  country public.country_code not null,
  rule_type public.visa_rule_type not null,
  applies_to_nationalities public.iso_country[] not null default '{}',
  applies_to_region text,
  value jsonb not null,
  description text not null,
  effective_from date not null,
  effective_to date,
  review_due date,
  source_url text not null,
  last_verified_at timestamptz not null,
  confidence public.confidence_level not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);
comment on column public.visa_rule.applies_to_nationalities is 'Empty array = applies to everyone.';
comment on column public.visa_rule.effective_to is 'Null = currently in force.';

create table public.grade_mapping (
  id uuid primary key default gen_random_uuid(),
  scale numeric(3,1) not null check (scale in (4.0, 5.0)),
  cgpa_min numeric(4,2) not null,
  cgpa_max numeric(4,2) not null,
  uk_class public.uk_class_band not null,
  gpa4_estimate numeric(3,2) not null check (gpa4_estimate between 0 and 4),
  percent_estimate int not null check (percent_estimate between 0 and 100),
  source_url text not null,
  last_verified_at timestamptz not null,
  confidence public.confidence_level not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cgpa_min <= cgpa_max and cgpa_max <= scale),
  unique (scale, uk_class)
);

create table public.fx_rate (
  id uuid primary key default gen_random_uuid(),
  base public.currency_code not null,
  quote public.currency_code not null,
  rate numeric(14,4) not null check (rate > 0),
  rate_kind text not null check (rate_kind in ('official', 'market')),
  fetched_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (base <> quote)
);

-- ---------------------------------------------------------------------------
-- Student activity
-- ---------------------------------------------------------------------------
create table public.shortlist (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profile (id) on delete cascade,
  programme_id uuid not null references public.programme (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, programme_id)
);
comment on table public.shortlist is 'Max 15 rows per free user; enforced in the API.';

create table public.application_tracker (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.student_profile (id) on delete cascade,
  programme_id uuid not null references public.programme (id) on delete cascade,
  stage public.tracker_stage not null default 'researching',
  checklist jsonb not null default '[]',
  next_reminder_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, programme_id)
);

-- ---------------------------------------------------------------------------
-- Ingestion bookkeeping (service role only)
-- ---------------------------------------------------------------------------
create table public.source_audit (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid,
  source_url text not null,
  fetched_at timestamptz not null,
  content_hash text,
  change_detected boolean not null default false,
  diff jsonb,
  verified_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.review_queue (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,
  record_id uuid,
  proposed jsonb not null,
  current jsonb,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Apply-link allow-list: apply_url must be https on one of the university's official domains.
-- ---------------------------------------------------------------------------
create function public.url_host(url text) returns text
language sql immutable set search_path = '' as $$
  select lower(substring(url from '^https://([^/:?#]+)'))
$$;

create function public.host_matches_domains(host text, domains text[]) returns boolean
language sql immutable set search_path = '' as $$
  select host is not null and exists (
    select 1 from unnest(domains) d
    where host = lower(d) or host like '%.' || lower(d)
  )
$$;

create function public.enforce_apply_url_allow_list() returns trigger
language plpgsql set search_path = '' as $$
declare
  domains text[];
begin
  select u.official_domains into domains from public.university u where u.id = new.university_id;
  if not public.host_matches_domains(public.url_host(new.apply_url), domains) then
    raise exception 'apply_url % is not on an official domain of university %', new.apply_url, new.university_id
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger programme_apply_url_allow_list
  before insert or update of apply_url, university_id on public.programme
  for each row execute function public.enforce_apply_url_allow_list();

-- Narrowing a university's domains must not orphan existing apply links.
create function public.enforce_domains_cover_apply_urls() returns trigger
language plpgsql set search_path = '' as $$
begin
  if exists (
    select 1 from public.programme p
    where p.university_id = new.id
      and not public.host_matches_domains(public.url_host(p.apply_url), new.official_domains)
  ) then
    raise exception 'official_domains for university % no longer cover all programme apply links', new.id
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger university_domains_cover_apply_urls
  before update of official_domains on public.university
  for each row execute function public.enforce_domains_cover_apply_urls();

-- ---------------------------------------------------------------------------
-- updated_at triggers and indexes
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'student_profile', 'university', 'programme', 'requirement', 'intake', 'fee', 'city_cost',
    'scholarship', 'visa_rule', 'grade_mapping', 'fx_rate', 'shortlist', 'application_tracker',
    'source_audit', 'review_queue'
  ] loop
    execute format(
      'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
      t || '_set_updated_at', t
    );
  end loop;
end $$;

create index programme_university_idx on public.programme (university_id);
create index programme_field_idx on public.programme (field);
create index programme_embedding_idx on public.programme using hnsw (embedding extensions.vector_cosine_ops);
create index intake_programme_idx on public.intake (programme_id);
create index fee_programme_idx on public.fee (programme_id);
create index university_country_idx on public.university (country);
create index visa_rule_lookup_idx on public.visa_rule (country, rule_type, effective_from);
create index city_cost_lookup_idx on public.city_cost (country, city);
create index fx_rate_lookup_idx on public.fx_rate (base, quote, rate_kind, fetched_at desc);
create index shortlist_programme_idx on public.shortlist (programme_id);
create index tracker_programme_idx on public.application_tracker (programme_id);
create index source_audit_record_idx on public.source_audit (table_name, record_id);
create index review_queue_status_idx on public.review_queue (status, created_at);
