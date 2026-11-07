-- Pilot: two new fields, professional registration, costs by city and province, FX entry, review stats.

alter type public.field_code add value if not exists 'nursing';
alter type public.field_code add value if not exists 'mental_health';

alter table public.requirement
  add column requires_professional_registration text not null default 'none'
    check (requires_professional_registration in ('none', 'nurse', 'other')),
  add column leads_to_registration text,
  add column clinical_placement boolean not null default false,
  add column open_to_international text check (open_to_international in ('yes', 'limited', 'no')),
  add column checks_required text[] not null default '{}'
    check (checks_required <@ array['police', 'health', 'immunisation']::text[]);
comment on column public.requirement.open_to_international is 'Null = the source does not say.';
comment on column public.requirement.leads_to_registration is 'Body the course leads to registration with, e.g. NMC or CNO.';

alter table public.student_profile
  add column professional_registration text not null default 'none'
    check (professional_registration in ('none', 'nurse', 'other'));

-- Flights vary by destination city and health cover by province, so estimates can be narrower than a country.
alter table public.cost_estimate
  add column region text,
  add column city text,
  add column observed_on date,
  add column evidence_path text,
  drop constraint cost_estimate_country_item_is_demo_key;
create unique index cost_estimate_scope_key
  on public.cost_estimate (country, item, coalesce(region, ''), coalesce(city, ''), is_demo);
comment on column public.cost_estimate.evidence_path is 'Screenshot in the private evidence bucket, e.g. a dated fare quote.';

-- Market rates are typed in by an admin each week, so we record who did it.
alter table public.fx_rate add column entered_by uuid references auth.users (id) on delete set null;

-- Which fields reviewers had to correct, to measure the extractor.
alter table public.review_queue add column field_changes text[];

insert into storage.buckets (id, name, public) values ('evidence', 'evidence', false)
on conflict (id) do nothing;
