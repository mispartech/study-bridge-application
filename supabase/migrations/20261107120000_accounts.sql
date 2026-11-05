-- Accounts: consent under the Nigeria Data Protection Act, and the wizard answers that have no column of their own.
alter table public.student_profile
  add column consent_given_at timestamptz,
  add column consent_version text,
  add column post_study_work text check (post_study_work in ('low', 'medium', 'high')),
  add column campus_or_city text check (campus_or_city in ('campus', 'city', 'either')),
  add column include_related_fields boolean not null default false,
  add column wizard_answers jsonb not null default '{}' check (jsonb_typeof(wizard_answers) = 'object');

comment on column public.student_profile.consent_given_at is 'When the student accepted the data notice. Null = no consent yet.';
comment on column public.student_profile.consent_version is 'Version of the notice accepted (lib/account/consent.ts).';
comment on column public.student_profile.wizard_answers is 'The wizard answers as entered, so the wizard can be reopened.';
