-- Step D of docs/CANADA_V1_PLAN.md: funding. Extends the existing scholarship table (decision D7) rather than
-- adding a new one. Additive (decision D6). The Step A findings drive the new fields: much funding is closed to
-- international students or only open after classes start, so both are stated per record, never assumed.

alter table public.scholarship
  add column funding_type text not null default 'scholarship'
    check (funding_type in ('scholarship', 'bursary', 'entrance_award', 'tuition_waiver', 'grant')),
  add column open_to_international text check (open_to_international in ('yes', 'limited', 'no')),
  add column eligible_from text not null default 'admission' check (eligible_from in ('admission', 'after_start')),
  add column automatic boolean not null default false,
  add column levels public.programme_level[] not null default '{}',
  add column regions text[] not null default '{}',
  add column university_id uuid references public.university (id) on delete cascade,
  add column percent_of_tuition int check (percent_of_tuition between 1 and 100),
  add column renewable boolean not null default false;

comment on column public.scholarship.open_to_international is
  'yes, limited (few places or restricted), or no. Null = the source does not say: never shown to students.';
comment on column public.scholarship.eligible_from is
  'admission: can be counted on before arriving. after_start: only once classes have begun (shown, never counted).';
comment on column public.scholarship.automatic is 'Awarded with the offer, no separate application.';
comment on column public.scholarship.levels is 'Empty array = every level.';
comment on column public.scholarship.regions is 'Provinces or regions it is limited to. Empty array = anywhere in its countries.';
comment on column public.scholarship.university_id is 'Set when only one institution''s students can get it.';
comment on column public.scholarship.percent_of_tuition is 'For awards stated as a share of tuition instead of an amount.';

-- Demo records are fictional and open to everyone, so demo mode keeps showing them.
update public.scholarship set open_to_international = 'yes' where is_demo;
