-- Everything the B4 matching and cost engine reads (docs/SPEC_B4.md sections 1 and 3).

-- GRE/GMAT: four states plus null = unknown, replacing the yes/no columns.
create type public.test_status as enum ('required', 'one_of_required', 'optional', 'not_required');

alter table public.requirement
  add column gre_status public.test_status,
  add column gmat_status public.test_status,
  add column pte_min numeric(3,0) check (pte_min between 10 and 90);

update public.requirement set
  gre_status = case when gre_required then 'required' else 'not_required' end::public.test_status,
  gmat_status = case when gmat_required then 'required' else 'not_required' end::public.test_status;

alter table public.requirement drop column gre_required, drop column gmat_required;

comment on column public.requirement.gre_status is 'Null = unknown: passes the filter and shows "Check test requirement".';
comment on column public.requirement.gmat_status is 'Null = unknown: passes the filter and shows "Check test requirement".';

-- Student inputs the filters need.
alter table public.student_profile
  add column tests_planned text[] not null default '{}'
    check (tests_planned <@ array['ielts', 'toefl', 'duolingo', 'pte', 'gre', 'gmat']::text[]),
  add column toefl_scale text check (toefl_scale in ('0-120', '1-6')),
  add column pte numeric(3,0) check (pte between 10 and 90),
  add column waec_english_grade text check (waec_english_grade in ('A1', 'B2', 'B3', 'C4', 'C5', 'C6', 'D7', 'E8', 'F9')),
  add column hnd_pgd boolean not null default false,
  add column target_cycle text check (target_cycle ~ '^\d{4}/\d{2}$'),
  add column target_term public.intake_term,
  add check (toefl is null or toefl_scale is not null);

comment on column public.student_profile.tests_planned is 'Tests booked or planned but not taken. Passes an admission-test filter, never the English filter.';
comment on column public.student_profile.toefl_scale is 'Scale of the student''s TOEFL result; compared only with minimums on the same scale.';
comment on column public.student_profile.hnd_pgd is 'HND + PGD pathway: treated as one band below the stated class unless the university says otherwise.';
comment on column public.student_profile.travel_document is
  'Issuer of the student''s passport or travel document (e.g. NG, PS). Visa rules can match this as well as nationality.';

-- A deposit normally counts towards tuition; when it doesn't, it is added to the first-year cost.
alter table public.intake add column deposit_credited_to_tuition boolean not null default true;

-- FX rows need provenance too, and demo rates must never mix with live ones.
alter table public.fx_rate
  add column source_url text,
  add column is_demo boolean not null default false;

-- Flat per-country estimates used by the cost engine.
create table public.cost_estimate (
  id uuid primary key default gen_random_uuid(),
  country public.country_code not null,
  item text not null check (item in ('flights', 'health_cover')),
  amount_minor bigint not null check (amount_minor >= 0),
  currency public.currency_code not null,
  per_year boolean not null default false,
  source_url text not null,
  last_verified_at timestamptz not null,
  confidence public.confidence_level not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (country, item, is_demo)
);
comment on column public.cost_estimate.per_year is 'True when the amount is charged per year of study, false for a one-off.';

create trigger cost_estimate_set_updated_at before update on public.cost_estimate
  for each row execute function public.set_updated_at();

alter table public.cost_estimate enable row level security;
revoke all on public.cost_estimate from anon, authenticated;
grant select on public.cost_estimate to anon, authenticated;
grant all on public.cost_estimate to service_role;
create policy cost_estimate_read on public.cost_estimate for select to anon, authenticated using (true);
