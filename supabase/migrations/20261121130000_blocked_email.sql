-- Addresses that must never receive an emailed report again (abuse, or the owner asked). Stored as the same
-- keyed hash the report table uses, never the address itself. Service role only.

create table public.blocked_email (
  email_hash text primary key,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);
alter table public.blocked_email enable row level security;
revoke all on public.blocked_email from anon, authenticated;
grant all on public.blocked_email to service_role;
