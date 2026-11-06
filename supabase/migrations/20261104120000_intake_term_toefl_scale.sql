-- Intakes can be known only by term ("Fall"), and TOEFL minimums can be published on both the
-- 0-120 and the 1-6 scale (docs/EXTRACTION.md sections 2 and 4).

create type public.intake_term as enum ('fall', 'winter', 'spring', 'summer');

alter table public.intake
  add column start_term public.intake_term,
  add column cycle text check (cycle ~ '^\d{4}/\d{2}$');

update public.intake set
  start_term = case
    when extract(month from start_month) between 8 and 10 then 'fall'
    when extract(month from start_month) between 3 and 5 then 'spring'
    when extract(month from start_month) between 6 and 7 then 'summer'
    else 'winter'
  end::public.intake_term,
  cycle = to_char(start_month - interval '7 months', 'YYYY') || '/' || to_char(start_month + interval '5 months', 'YY');

alter table public.intake
  alter column start_term set not null,
  alter column cycle set not null,
  alter column start_month drop not null,
  drop constraint intake_programme_id_start_month_key,
  add constraint intake_programme_id_cycle_start_term_key unique (programme_id, cycle, start_term);

comment on column public.intake.start_month is 'First day of the start month; null when the source gives only a term.';
comment on column public.intake.cycle is 'Academic cycle, e.g. 2027/28 covers September 2027, January 2028 and May 2028.';

alter table public.requirement
  add column toefl_entries jsonb not null default '[]' check (jsonb_typeof(toefl_entries) = 'array');

update public.requirement
set toefl_entries = jsonb_build_array(jsonb_build_object('scale', '0-120', 'overall_min', toefl_min, 'subscore_min', null))
where toefl_min is not null;

comment on column public.requirement.toefl_entries is 'One entry per published scale: {scale: "0-120" | "1-6", overall_min, subscore_min}.';
comment on column public.requirement.toefl_min is 'Overall minimum on the 0-120 scale; toefl_entries holds every published scale.';
