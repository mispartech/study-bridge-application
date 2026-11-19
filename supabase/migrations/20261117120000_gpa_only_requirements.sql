-- Canadian programmes state a GPA minimum, not a UK degree class, so a requirement needs one or the other.
-- The international office link is helpful but not needed to publish a programme.

alter table public.requirement alter column min_uk_class drop not null;
alter table public.requirement add constraint requirement_has_academic_minimum
  check (min_uk_class is not null or min_gpa4 is not null) not valid;
alter table public.requirement validate constraint requirement_has_academic_minimum;
alter table public.university alter column intl_office_url drop not null;
