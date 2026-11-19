-- Emailed reports for one-time users (docs/SPEC_ACCESS_ADMIN.md, section 2). If the student never uses the
-- link in the email, this row is the only thing kept, and it is deleted after 12 months or on unsubscribe.

create table public.report (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email)),
  email_hash text not null,
  profile_snapshot jsonb not null,
  results_snapshot jsonb not null,
  reminders_consent boolean not null default false,
  marketing_consent boolean not null default false,
  consent_text_version text not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  delivery_status text not null default 'queued' check (delivery_status in ('queued', 'sent', 'failed')),
  opened_at timestamptz,
  claimed_user_id uuid references auth.users (id) on delete set null,
  claimed_at timestamptz,
  expires_at timestamptz not null default now() + interval '12 months'
);
comment on table public.report is 'Service role only. Snapshot of a student''s results as emailed, with the consents they gave.';
create index report_email_hash on public.report (email_hash, created_at desc);
create index report_unclaimed_expiry on public.report (expires_at) where claimed_user_id is null;
create index report_claimed_user on public.report (claimed_user_id) where claimed_user_id is not null;

alter table public.report enable row level security;
revoke all on public.report from anon, authenticated;
grant all on public.report to service_role;
