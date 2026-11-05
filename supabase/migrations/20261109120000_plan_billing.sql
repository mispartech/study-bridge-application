-- B7: one reminder per event, and Paystack payments.

create table public.reminder_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  programme_id uuid references public.programme (id) on delete cascade,
  kind text not null check (kind in ('deadline', 'record_change')),
  dedupe_key text not null,
  sent_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);
alter table public.reminder_log enable row level security;
revoke all on public.reminder_log from anon, authenticated;
grant all on public.reminder_log to service_role;
comment on table public.reminder_log is 'Service role only: stops the daily job repeating a reminder.';

-- user_id clears on account deletion, leaving an anonymous payment record.
create table public.payment (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  reference text not null unique,
  amount_minor bigint not null check (amount_minor >= 0),
  currency text not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger payment_set_updated_at before update on public.payment
  for each row execute function public.set_updated_at();
alter table public.payment enable row level security;
revoke all on public.payment from anon, authenticated;
grant select on public.payment to authenticated;
grant all on public.payment to service_role;
create policy payment_owner_read on public.payment
  for select to authenticated using (user_id = (select auth.uid()));
