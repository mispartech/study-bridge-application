-- Some visa rules apply to a travel document rather than a nationality
-- (Proclamation 10998 covers Palestinian Authority travel documents; docs/EXTRACTION.md section 6).

alter table public.student_profile
  add column travel_document public.iso_country;
comment on column public.student_profile.travel_document is
  'Issuer of the travel document the student will use, when it is not a national passport (e.g. PS).';

alter table public.visa_rule
  add column applies_to_travel_documents public.iso_country[] not null default '{}';
comment on column public.visa_rule.applies_to_travel_documents is
  'Travel-document issuers this rule applies to, matched against student_profile.travel_document. '
  'A rule applies when the nationality OR the travel document matches; both empty = everyone.';
