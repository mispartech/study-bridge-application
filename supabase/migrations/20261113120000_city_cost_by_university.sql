-- Hall prices differ between universities in the same city, so a city cost can belong to one university.
-- Matching prefers the university's own figure, then the city's.

alter table public.city_cost
  add column university_id uuid references public.university (id) on delete cascade,
  drop constraint city_cost_country_city_accommodation_type_is_demo_key;
create unique index city_cost_scope_key
  on public.city_cost (country, city, accommodation_type, coalesce(university_id::text, ''), is_demo);
comment on column public.city_cost.university_id is 'Null = a city-wide figure; set = this university''s own halls or estimate.';
