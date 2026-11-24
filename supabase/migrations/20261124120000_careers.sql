-- Step E of docs/CANADA_V1_PLAN.md: occupations, regional demand, work-permit fields of study and the links from
-- programmes to occupations. Country-agnostic: Canada uses NOC 2021, the UK SOC 2020. Additive only (D6).

create table public.occupation (
  id uuid primary key default gen_random_uuid(),
  country public.country_code not null,
  system text not null check (system in ('NOC2021', 'SOC2020', 'SOC2018')),
  code text not null check (code ~ '^[0-9][0-9.\-]{2,9}$'),
  title text not null check (char_length(title) between 2 and 200),
  source_url text not null check (source_url like 'https://%'),
  last_verified_at timestamptz not null,
  confidence public.confidence_level not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (system, code)
);

create table public.occupation_demand (
  id uuid primary key default gen_random_uuid(),
  occupation_id uuid not null references public.occupation (id) on delete cascade,
  region text not null default '',
  source_type text not null check (source_type in ('in_demand_list', 'nominee_stream', 'job_outlook', 'shortage_list')),
  label text not null check (char_length(label) between 2 and 160),
  valid_from date not null,
  valid_to date check (valid_to is null or valid_to >= valid_from),
  source_url text not null check (source_url like 'https://%'),
  last_verified_at timestamptz not null,
  confidence public.confidence_level not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (occupation_id, region, source_type)
);
comment on column public.occupation_demand.region is 'Province or region; empty = the whole country.';

create table public.work_permit_field (
  id uuid primary key default gen_random_uuid(),
  country public.country_code not null,
  code text not null check (code ~ '^\d{2}\.\d{4}$'),
  title text not null check (char_length(title) between 2 and 200),
  category text not null check (char_length(category) between 2 and 100),
  eligible_from date not null,
  eligible_to date check (eligible_to is null or eligible_to >= eligible_from),
  source_url text not null check (source_url like 'https://%'),
  last_verified_at timestamptz not null,
  confidence public.confidence_level not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (country, code)
);
comment on table public.work_permit_field is 'Fields of study that qualify a non-degree programme for a work permit (e.g. IRCC''s PGWP CIP list).';

create table public.programme_occupation (
  programme_id uuid not null references public.programme (id) on delete cascade,
  occupation_id uuid not null references public.occupation (id) on delete cascade,
  status text not null default 'suggested' check (status in ('suggested', 'approved', 'rejected')),
  suggested_by text not null check (suggested_by in ('ai', 'editor')),
  rationale text not null default '' check (char_length(rationale) <= 400),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (programme_id, occupation_id),
  check (status = 'suggested' or reviewed_at is not null)
);
comment on table public.programme_occupation is 'Only approved links are ever used in matching or shown to students.';

do $$
declare t text;
begin
  foreach t in array array['occupation', 'occupation_demand', 'work_permit_field', 'programme_occupation'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;
