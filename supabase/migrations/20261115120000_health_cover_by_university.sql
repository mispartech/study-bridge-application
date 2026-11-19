-- Some universities make their own health plan compulsory (McGill, Dalhousie), so a health estimate can
-- belong to one university. Matching uses the university's plan, then the province's, then the country's.

alter table public.cost_estimate
  add column university_id uuid references public.university (id) on delete cascade;
drop index public.cost_estimate_scope_key;
create unique index cost_estimate_scope_key on public.cost_estimate
  (country, item, coalesce(region, ''), coalesce(city, ''), coalesce(university_id::text, ''), is_demo);
comment on column public.cost_estimate.university_id is 'Set for a university''s own compulsory plan.';
