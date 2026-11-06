-- The WAEC/NECO English waiver depends on the grade each university states. No stated grade, no waiver.
alter table public.requirement
  add column waec_min_grade text check (waec_min_grade in ('A1', 'B2', 'B3', 'C4', 'C5', 'C6', 'D7', 'E8', 'F9'));

comment on column public.requirement.waec_min_grade is
  'Lowest WAEC/NECO English grade accepted in place of an English test. Null = no stated grade, so no waiver.';
